using GeoService.Data;
using GeoService.DTOs;
using GeoService.Models;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<GeoDbContext>(options => {
    var cs = builder.Configuration.GetConnectionString("Default") ??
             builder.Configuration["ConnectionStrings:Default"] ??
             builder.Configuration["ConnectionStrings__Default"];
    options.UseNpgsql(cs);
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(opt => {
    var allowed = builder.Configuration["CORS:AllowedOrigins"] ?? "*";
    opt.AddPolicy("All", p => {
        if (allowed == "*") p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
        else p.WithOrigins(allowed.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
              .AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GeoDbContext>();
    try
    {
        // Mevcut tabloyu kontrol et ve gerekirse migration yap
        db.Database.EnsureCreated();
        
        // Radius kolonu yoksa ekle (migration olmadan)
        try
        {
            var connection = db.Database.GetDbConnection();
            await connection.OpenAsync();
            using var command = connection.CreateCommand();
            // PostgreSQL'de tablo adları case-sensitive, küçük harf kullan
            command.CommandText = @"
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='Places' AND column_name='Radius';
            ";
            var hasRadius = await command.ExecuteScalarAsync();
            if (hasRadius == null)
            {
                command.CommandText = "ALTER TABLE \"Places\" ADD COLUMN \"Radius\" double precision;";
                await command.ExecuteNonQueryAsync();
                Console.WriteLine("Added Radius column to Places table");
            }
            await connection.CloseAsync();
        }
        catch (Exception migrationEx)
        {
            // Migration hatası kritik değil, devam et
            Console.WriteLine($"Migration warning (non-critical): {migrationEx.Message}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database initialization warning: {ex.Message}");
    }
}

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("All");

app.MapGet("/api/health", () => Results.Ok(new { ok = true, service = "geo" }));

app.MapPost("/api/places/upsert", async (PlaceUpsertRequest req, GeoDbContext db) =>
{
    try
    {
        var existing = await db.Places.FirstOrDefaultAsync(p => p.RefType == req.RefType && p.RefId == req.RefId);
        if (existing is null)
        {
            var p = new Place {
                RefType = req.RefType,
                RefId = req.RefId,
                Latitude = req.Latitude,
                Longitude = req.Longitude,
                Radius = req.Radius,
                AddressLabel = req.AddressLabel
            };
            db.Places.Add(p);
            await db.SaveChangesAsync();
            return Results.Ok(new PlaceResponse(p.Id, p.RefType, p.RefId, p.Latitude, p.Longitude, p.Radius, p.AddressLabel));
        }
        else
        {
            existing.Latitude = req.Latitude;
            existing.Longitude = req.Longitude;
            existing.Radius = req.Radius;
            existing.AddressLabel = req.AddressLabel;
            existing.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(new PlaceResponse(existing.Id, existing.RefType, existing.RefId, existing.Latitude, existing.Longitude, existing.Radius, existing.AddressLabel));
        }
    }
    catch (Exception ex)
    {
        return Results.Problem($"Error upserting place: {ex.Message}", statusCode: 500);
    }
});

app.MapGet("/api/places/by-ref", async (string refType, string refId, GeoDbContext db) =>
{
    var p = await db.Places.FirstOrDefaultAsync(x => x.RefType == refType && x.RefId == refId);
    if (p is null) return Results.NotFound();
    return Results.Ok(new PlaceResponse(p.Id, p.RefType, p.RefId, p.Latitude, p.Longitude, p.Radius, p.AddressLabel));
});

app.Run();
