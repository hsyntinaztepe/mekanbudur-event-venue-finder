using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseStaticFiles();

// public klasöründeki dosyaları da sun
var publicPath = Path.Combine(builder.Environment.ContentRootPath, "public");
if (Directory.Exists(publicPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(publicPath),
        RequestPath = ""
    });
}

app.UseRouting();
app.UseAuthorization();

app.MapRazorPages();

app.Run();
