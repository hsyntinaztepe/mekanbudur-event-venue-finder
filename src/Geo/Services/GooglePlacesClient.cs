using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using GeoService;

namespace GeoService.Services;

public class GooglePlacesClient
{
    private readonly HttpClient _http;
    private readonly GooglePlacesOptions _options;

    public GooglePlacesClient(HttpClient http, IOptions<GooglePlacesOptions> options)
    {
        _http = http;
        _options = options.Value;
    }

    public async Task<IReadOnlyList<GooglePlaceDto>> SearchNearbyAsync(
        double? lat = null,
        double? lng = null,
        int? radius = null,
        string? keyword = null,
        CancellationToken cancellationToken = default)
    {
        var latVal = lat ?? _options.DefaultLat;
        var lngVal = lng ?? _options.DefaultLng;
        var radiusVal = radius ?? _options.DefaultRadius;
        var keywordVal = string.IsNullOrWhiteSpace(keyword)
            ? "düğün salonu OR fotoğrafçı OR pastane"
            : keyword;

        var url =
            $"https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
            $"?location={latVal.ToString(System.Globalization.CultureInfo.InvariantCulture)}," +
            $"{lngVal.ToString(System.Globalization.CultureInfo.InvariantCulture)}" +
            $"&radius={radiusVal}" +
            $"&keyword={Uri.EscapeDataString(keywordVal)}" +
            $"&language=tr" +
            $"&key={_options.ApiKey}";

        using var resp = await _http.GetAsync(url, cancellationToken);
        resp.EnsureSuccessStatusCode();

        var json = await resp.Content.ReadAsStringAsync(cancellationToken);
        Console.WriteLine($"[GooglePlaces] Response: {json}");

        var root = await resp.Content.ReadFromJsonAsync<GooglePlacesApiResponse>(cancellationToken: cancellationToken);
        Console.WriteLine($"[GooglePlaces] Status: {root?.Status}, Results Count: {root?.Results?.Count ?? 0}");
        
        if (!string.IsNullOrEmpty(root?.ErrorMessage))
        {
            Console.WriteLine($"[GooglePlaces] Error: {root.ErrorMessage}");
        }
        
        if (root?.Results == null) return Array.Empty<GooglePlaceDto>();

        return root.Results
            .Where(r => r.Geometry?.Location != null)
            .Select(r => new GooglePlaceDto
            {
                Name = r.Name ?? string.Empty,
                Address = r.Vicinity ?? r.FormattedAddress ?? string.Empty,
                Lat = r.Geometry!.Location!.Lat,
                Lng = r.Geometry!.Location!.Lng
            })
            .ToList();
    }

    // İç DTO/JSON tipleri
    public class GooglePlacesApiResponse
    {
        [JsonPropertyName("results")]
        public List<Result>? Results { get; set; }
        
        [JsonPropertyName("status")]
        public string? Status { get; set; }
        
        [JsonPropertyName("error_message")]
        public string? ErrorMessage { get; set; }
    }

    public class Result
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }
        
        [JsonPropertyName("vicinity")]
        public string? Vicinity { get; set; }
        
        [JsonPropertyName("formatted_address")]
        public string? FormattedAddress { get; set; }
        
        [JsonPropertyName("geometry")]
        public Geometry? Geometry { get; set; }
    }

    public class Geometry
    {
        [JsonPropertyName("location")]
        public Location? Location { get; set; }
    }

    public class Location
    {
        [JsonPropertyName("lat")]
        public double Lat { get; set; }
        
        [JsonPropertyName("lng")]
        public double Lng { get; set; }
    }
}

public class GooglePlaceDto
{
    public string Name { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public double Lat { get; set; }
    public double Lng { get; set; }
}
