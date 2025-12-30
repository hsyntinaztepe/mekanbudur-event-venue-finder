namespace GeoService;

public class GooglePlacesOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public double DefaultLat { get; set; } = 39.7800;   // Ankara / Gölbaşı
    public double DefaultLng { get; set; } = 32.8000;
    public int DefaultRadius { get; set; } = 5000;      // metre
}
