using System.Security.Claims;
using System.Text;
using MekanBudur.Api.Data;
using MekanBudur.Api.DTOs;
using MekanBudur.Api.Models;
using MekanBudur.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
{
    var cs = builder.Configuration.GetConnectionString("Default") ??
             builder.Configuration["ConnectionStrings:Default"] ??
             builder.Configuration["ConnectionStrings__Default"];
    options.UseNpgsql(cs);
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddPolicy("All", policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddSingleton<PasswordHasher<User>>();

// Geo client
builder.Services.AddHttpClient<GeoClient>(client =>
{
    var baseUrl = builder.Configuration["GeoService:BaseUrl"] ?? "http://localhost:8082";
    client.BaseAddress = new Uri(baseUrl);
});

var jwtKey = builder.Configuration["Jwt:Key"] ?? "supersecret_dev_jwt_key_change_me";
var issuer = builder.Configuration["Jwt:Issuer"] ?? "MekanBudur";
var audience = builder.Configuration["Jwt:Audience"] ?? "MekanBudurUsers";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = issuer,
            ValidAudience = audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var hasher = scope.ServiceProvider.GetRequiredService<PasswordHasher<User>>();
    db.Database.EnsureCreated();
    SeedData.EnsureSeeded(db, hasher);
}

app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("All");
app.UseAuthentication();
app.UseAuthorization();

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { ok = true, service = "api" }));
app.MapGet("/api/health", () => Results.Ok(new { ok = true, service = "api" }));

string GetDisplayName(AppDbContext db, Guid userId)
    => db.Users.Where(u => u.Id == userId).Select(u => u.DisplayName ?? u.Email).FirstOrDefault() ?? "Kullanıcı";

Guid GetUserId(ClaimsPrincipal user)
    => Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out var g) ? g : Guid.Empty;

// AUTH
app.MapPost("/api/auth/register", async (HttpRequest httpReq, AppDbContext db, PasswordHasher<User> hasher, JwtTokenService jwt, GeoClient geo) =>
{
    try
    {
        // Request body'yi oku
        RegisterRequest? req = null;
        try
        {
            req = await httpReq.ReadFromJsonAsync<RegisterRequest>();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"JSON deserialization error: {ex.Message}");
            return Results.BadRequest(new { error = "Geçersiz istek formatı. Lütfen tüm alanları doğru formatta doldurun." });
        }
        
        // Model binding kontrolü
        if (req == null)
            return Results.BadRequest(new { error = "Geçersiz istek. Lütfen tüm alanları doldurun." });
        
        Console.WriteLine($"Register request received: Email={req.Email}, Role={req.Role}, DisplayName={req.DisplayName}");
            
        // Model validation kontrolü
        if (string.IsNullOrWhiteSpace(req.Email))
            return Results.BadRequest(new { error = "Email gereklidir." });
        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 6)
            return Results.BadRequest(new { error = "Şifre en az 6 karakter olmalıdır." });
        if (string.IsNullOrWhiteSpace(req.DisplayName))
            return Results.BadRequest(new { error = "Ad Soyad gereklidir." });
        if (string.IsNullOrWhiteSpace(req.Role))
            return Results.BadRequest(new { error = "Hesap tipi gereklidir." });
        
        // Role enum'a parse et
        UserRole userRole;
        if (!Enum.TryParse<UserRole>(req.Role, ignoreCase: true, out userRole))
        {
            return Results.BadRequest(new { error = $"Geçersiz hesap tipi: {req.Role}. 'User' veya 'Vendor' olmalıdır." });
        }
        
        // Email format kontrolü
        try
        {
            var emailAddr = new System.Net.Mail.MailAddress(req.Email);
            if (emailAddr.Address != req.Email)
                return Results.BadRequest(new { error = "Geçersiz email formatı." });
        }
        catch
        {
            return Results.BadRequest(new { error = "Geçersiz email formatı." });
        }
            
        if (await db.Users.AnyAsync(u => u.Email == req.Email.Trim().ToLowerInvariant()))
            return Results.BadRequest(new { error = "Email zaten kayıtlı." });

        var user = new User
        {
            Email = req.Email.Trim().ToLowerInvariant(),
            DisplayName = req.DisplayName,
            Role = userRole
        };
        user.PasswordHash = hasher.HashPassword(user, req.Password);
        db.Users.Add(user);
        await db.SaveChangesAsync();

        if (userRole == UserRole.Vendor && !string.IsNullOrWhiteSpace(req.CompanyName))
        {
            var vp = new VendorProfile
            {
                UserId = user.Id,
                CompanyName = req.CompanyName!,
                ServiceCategoriesCsv = req.ServiceCategoriesCsv
            };
            db.VendorProfiles.Add(vp);
            await db.SaveChangesAsync();

            // Geo: vendor mekânı
            if (req.VenueLatitude.HasValue && req.VenueLongitude.HasValue)
            {
                try
                {
                    await geo.UpsertAsync("Vendor", user.Id.ToString(), req.VenueLatitude.Value, req.VenueLongitude.Value, null, req.VenueAddressLabel);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Geo service error during registration: {ex.Message}");
                }
            }
        }

        var token = jwt.Generate(user);
        return Results.Ok(new AuthResponse(token, user.Role.ToString(), user.DisplayName ?? user.Email));
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error during registration: {ex.Message}");
        Console.WriteLine($"Stack trace: {ex.StackTrace}");
        return Results.Problem(
            title: "Kayıt sırasında hata oluştu",
            detail: ex.Message,
            statusCode: 500
        );
    }
});

app.MapPost("/api/auth/login", async (LoginRequest req, AppDbContext db, PasswordHasher<User> hasher, JwtTokenService jwt) =>
{
    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == req.Email.Trim().ToLowerInvariant());
    if (user is null)
        return Results.BadRequest(new { error = "Geçersiz kimlik bilgileri." });

    var result = hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password);
    if (result == PasswordVerificationResult.Failed)
        return Results.BadRequest(new { error = "Geçersiz kimlik bilgileri." });

    var token = jwt.Generate(user);
    return Results.Ok(new AuthResponse(token, user.Role.ToString(), user.DisplayName ?? user.Email));
});

// CATEGORIES
app.MapGet("/api/categories", async (AppDbContext db) =>
    await db.ServiceCategories.OrderBy(c => c.Name).Select(c => new { c.Id, c.Name }).ToListAsync()
);

// LISTINGS
app.MapGet("/api/listings", async (AppDbContext db, int? categoryId, string? q, string? location, decimal? minBudget, decimal? maxBudget) =>
{
    var query = db.EventListings
        .Include(l => l.Category)
        .Include(l => l.CreatedByUser)
        .Where(l => l.Status == ListingStatus.Open)
        .AsQueryable();

    if (categoryId.HasValue) query = query.Where(l => l.CategoryId == categoryId);
    if (!string.IsNullOrWhiteSpace(q)) query = query.Where(l => l.Title.Contains(q) || (l.Description ?? "").Contains(q));
    if (!string.IsNullOrWhiteSpace(location)) query = query.Where(l => l.Location!.Contains(location));
    if (minBudget.HasValue) query = query.Where(l => l.Budget >= minBudget);
    if (maxBudget.HasValue) query = query.Where(l => l.Budget <= maxBudget);

    var data = await query
        .OrderByDescending(l => l.CreatedAtUtc)
        .Take(200)
        .Select(l => new ListingResponse(
            l.Id, l.Title, l.Description, l.EventDate, l.Location, l.Budget, l.CategoryId, l.Category.Name,
            l.CreatedByUser.DisplayName ?? l.CreatedByUser.Email, l.Status.ToString(), l.CreatedAtUtc,
            null, null, null, null // geo not included in list for performans
        )).ToListAsync();

    return Results.Ok(data);
});

app.MapGet("/api/listings/{id:guid}", async (Guid id, AppDbContext db, GeoClient geo) =>
{
    var l = await db.EventListings.Include(x => x.Category).Include(x => x.CreatedByUser).FirstOrDefaultAsync(x => x.Id == id);
    if (l is null) return Results.NotFound();

    double? lat = null; double? lng = null; double? radius = null; string? label = null;
    var place = await geo.ByRefAsync("Listing", l.Id.ToString());
    if (place is not null) { lat = place.Latitude; lng = place.Longitude; radius = place.Radius; label = place.AddressLabel; }

    return Results.Ok(new ListingResponse(
        l.Id, l.Title, l.Description, l.EventDate, l.Location, l.Budget, l.CategoryId, l.Category.Name,
        l.CreatedByUser.DisplayName ?? l.CreatedByUser.Email, l.Status.ToString(), l.CreatedAtUtc,
        lat, lng, radius, label
    ));
});

app.MapGet("/api/listings/mine", [Authorize(Roles = "User")] async (ClaimsPrincipal me, AppDbContext db) =>
{
    var myId = GetUserId(me);
    var data = await db.EventListings
        .Include(l => l.Category)
        .Where(l => l.CreatedByUserId == myId)
        .OrderByDescending(l => l.CreatedAtUtc)
        .Select(l => new ListingResponse(
            l.Id, l.Title, l.Description, l.EventDate, l.Location, l.Budget, l.CategoryId, l.Category.Name,
            "", l.Status.ToString(), l.CreatedAtUtc, null, null, null, null))
        .ToListAsync();
    return Results.Ok(data);
});

app.MapPost("/api/listings", [Authorize(Roles = "User")] async (ListingCreateRequest req, ClaimsPrincipal me, AppDbContext db, GeoClient geo) =>
{
    try
    {
        // EventDate validasyonu - UTC'ye çevir
        var eventDateUtc = req.EventDate.Kind == DateTimeKind.Unspecified 
            ? DateTime.SpecifyKind(req.EventDate, DateTimeKind.Utc)
            : req.EventDate.ToUniversalTime();
            
        if (eventDateUtc.Date <= DateTime.UtcNow.Date)
            return Results.BadRequest(new { error = "Etkinlik tarihi bugünden ileri olmalı." });

        var myId = GetUserId(me);
        if (myId == Guid.Empty)
            return Results.Unauthorized();

        var category = await db.ServiceCategories.FindAsync(req.CategoryId);
        if (category is null) return Results.BadRequest(new { error = "Geçersiz kategori." });

        var listing = new EventListing
        {
            Title = req.Title,
            Description = req.Description,
            EventDate = eventDateUtc,
            Location = req.Location,
            Budget = req.Budget,
            CategoryId = req.CategoryId,
            CreatedByUserId = myId,
            Status = ListingStatus.Open,
            CreatedAtUtc = DateTime.UtcNow
        };
        db.EventListings.Add(listing);
        await db.SaveChangesAsync();

        // Geo: ilan konumu
        if (req.Latitude.HasValue && req.Longitude.HasValue)
        {
            try
            {
                await geo.UpsertAsync("Listing", listing.Id.ToString(), req.Latitude.Value, req.Longitude.Value, req.Radius, req.AddressLabel);
            }
            catch (Exception ex)
            {
                // Geo servis hatası ilan oluşturmayı engellemez, sadece logla
                Console.WriteLine($"Geo service error: {ex.Message}");
            }
        }

        return Results.Created($"/api/listings/{listing.Id}", new { listing.Id });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error creating listing: {ex.Message}");
        Console.WriteLine($"Stack trace: {ex.StackTrace}");
        if (ex.InnerException != null)
        {
            Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
        }
        // Daha detaylı hata mesajı döndür
        var errorMessage = ex.Message;
        if (ex.InnerException != null)
        {
            errorMessage += $" ({ex.InnerException.Message})";
        }
        return Results.Problem(
            title: "İlan oluşturulurken hata oluştu",
            detail: errorMessage,
            statusCode: 500
        );
    }
});

// GEO proxy endpoints
app.MapGet("/api/geo/listings/{id:guid}", async (Guid id, GeoClient geo) =>
{
    var place = await geo.ByRefAsync("Listing", id.ToString());
    if (place is null) return Results.NotFound();
    return Results.Ok(place);
});

app.MapGet("/api/geo/vendors/{userId:guid}", async (Guid userId, GeoClient geo) =>
{
    var place = await geo.ByRefAsync("Vendor", userId.ToString());
    if (place is null) return Results.NotFound();
    return Results.Ok(place);
});

// BIDS
app.MapPost("/api/bids", [Authorize(Roles = "Vendor")] async (BidCreateRequest req, ClaimsPrincipal me, AppDbContext db) =>
{
    var myId = GetUserId(me);
    var listing = await db.EventListings.FirstOrDefaultAsync(l => l.Id == req.EventListingId);
    if (listing is null) return Results.BadRequest(new { error = "İlan bulunamadı." });
    if (listing.CreatedByUserId == myId) return Results.BadRequest(new { error = "Kendi ilanınıza teklif veremezsiniz." });
    if (listing.Status != ListingStatus.Open) return Results.BadRequest(new { error = "İlan açık değil." });

    var bid = new Bid
    {
        EventListingId = listing.Id,
        VendorUserId = myId,
        Amount = req.Amount,
        Message = req.Message,
        Status = BidStatus.Pending,
        CreatedAtUtc = DateTime.UtcNow
    };
    db.Bids.Add(bid);
    await db.SaveChangesAsync();
    return Results.Ok(new { bid.Id });
});

app.MapGet("/api/bids/mine", [Authorize(Roles = "Vendor")] async (ClaimsPrincipal me, AppDbContext db) =>
{
    var myId = GetUserId(me);
    var bids = await db.Bids
        .Include(b => b.EventListing).ThenInclude(l => l.Category)
        .Where(b => b.VendorUserId == myId)
        .OrderByDescending(b => b.CreatedAtUtc)
        .Select(b => new
        {
            b.Id,
            b.EventListingId,
            ListingTitle = b.EventListing.Title,
            Category = b.EventListing.Category.Name,
            b.Amount,
            b.Message,
            b.Status,
            b.CreatedAtUtc
        })
        .ToListAsync();
    return Results.Ok(bids);
});

app.MapGet("/api/listings/{id:guid}/bids", [Authorize] async (Guid id, ClaimsPrincipal me, AppDbContext db) =>
{
    var myId = GetUserId(me);
    var listing = await db.EventListings.Include(l => l.CreatedByUser).FirstOrDefaultAsync(l => l.Id == id);
    if (listing is null) return Results.NotFound();
    if (listing.CreatedByUserId != myId) return Results.Forbid();

    var result = await db.Bids
        .Include(b => b.VendorUser)
        .Where(b => b.EventListingId == id)
        .OrderByDescending(b => b.CreatedAtUtc)
        .Select(b => new BidResponse(b.Id, b.EventListingId, b.Amount, b.Message,
            b.VendorUser.DisplayName ?? b.VendorUser.Email, b.Status.ToString(), b.CreatedAtUtc))
        .ToListAsync();
    return Results.Ok(result);
});

app.MapPost("/api/bids/{id:guid}/accept", [Authorize(Roles = "User")] async (Guid id, ClaimsPrincipal me, AppDbContext db) =>
{
    var myId = GetUserId(me);
    var bid = await db.Bids.Include(b => b.EventListing).FirstOrDefaultAsync(b => b.Id == id);
    if (bid is null) return Results.NotFound();
    if (bid.EventListing.CreatedByUserId != myId) return Results.Forbid();
    if (bid.EventListing.Status != ListingStatus.Open) return Results.BadRequest(new { error = "İlan açık değil." });

    bid.Status = BidStatus.Accepted;
    var others = db.Bids.Where(b => b.EventListingId == bid.EventListingId && b.Id != bid.Id);
    await others.ForEachAsync(b => b.Status = BidStatus.Rejected);
    bid.EventListing.Status = ListingStatus.Awarded;
    await db.SaveChangesAsync();

    return Results.Ok(new { ok = true });
});

app.Run();

