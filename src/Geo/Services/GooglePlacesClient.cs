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
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            Console.WriteLine("[GooglePlaces] ApiKey is empty. Returning 0 results.");
            return Array.Empty<GooglePlaceDto>();
        }

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

        if (root is null)
        {
            throw new InvalidOperationException("Google Places response could not be parsed.");
        }

        var status = (root.Status ?? string.Empty).Trim();
        var isOk = status.Equals("OK", StringComparison.OrdinalIgnoreCase);
        var isZero = status.Equals("ZERO_RESULTS", StringComparison.OrdinalIgnoreCase);

        // Don't crash the API when Google denies the request (most commonly: billing disabled)
        // or when quota is exceeded. Return empty results so the UI can gracefully fall back.
        var isDenied = status.Equals("REQUEST_DENIED", StringComparison.OrdinalIgnoreCase);
        var isOverQuota = status.Equals("OVER_QUERY_LIMIT", StringComparison.OrdinalIgnoreCase);
        var isInvalid = status.Equals("INVALID_REQUEST", StringComparison.OrdinalIgnoreCase);
        if (!isOk && !isZero)
        {
            if (isDenied || isOverQuota || isInvalid)
            {
                var msg = string.IsNullOrWhiteSpace(root.ErrorMessage)
                    ? $"Google Places request not available ({status}). Returning 0 results."
                    : $"Google Places request not available ({status}): {root.ErrorMessage}. Returning 0 results.";
                Console.WriteLine($"[GooglePlaces] {msg}");
                return Array.Empty<GooglePlaceDto>();
            }

            var msg2 = string.IsNullOrWhiteSpace(root.ErrorMessage)
                ? $"Google Places request failed ({status})."
                : $"Google Places request failed ({status}): {root.ErrorMessage}";
            throw new InvalidOperationException(msg2);
        }
        
        if (root?.Results == null) return Array.Empty<GooglePlaceDto>();

        return root.Results
            .Where(r => r.Geometry?.Location != null)
            .Select(r => new GooglePlaceDto
            {
                Name = r.Name ?? string.Empty,
                Address = r.Vicinity ?? r.FormattedAddress ?? string.Empty,
                Lat = r.Geometry!.Location!.Lat,
                Lng = r.Geometry!.Location!.Lng,
                PhotoReference = r.Photos?.FirstOrDefault()?.PhotoReference
            })
            .ToList();
    }

    public async Task<(byte[] bytes, string contentType)> GetPhotoAsync(
        string photoReference,
        int maxWidth = 480,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(photoReference))
        {
            throw new ArgumentException("photoReference is required", nameof(photoReference));
        }

        var safeMaxWidth = Math.Clamp(maxWidth, 64, 1600);

        var url =
            $"https://maps.googleapis.com/maps/api/place/photo" +
            $"?maxwidth={safeMaxWidth}" +
            $"&photoreference={Uri.EscapeDataString(photoReference)}" +
            $"&key={_options.ApiKey}";

        using var resp = await _http.GetAsync(url, cancellationToken);
        resp.EnsureSuccessStatusCode();

        var bytes = await resp.Content.ReadAsByteArrayAsync(cancellationToken);
        var contentType = resp.Content.Headers.ContentType?.ToString() ?? "image/jpeg";

        return (bytes, contentType);
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

        [JsonPropertyName("photos")]
        public List<Photo>? Photos { get; set; }
    }

    public class Photo
    {
        [JsonPropertyName("photo_reference")]
        public string? PhotoReference { get; set; }
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
    public string? PhotoReference { get; set; }
}
