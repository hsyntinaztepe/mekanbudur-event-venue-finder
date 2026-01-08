using System.Collections.Generic;
using System.Net.Http.Json;
using System.Text.Json;

namespace MekanBudur.Api.Services
{
    public class GeoClient
    {
        private readonly HttpClient _http;
        public GeoClient(HttpClient http) => _http = http;

        private static async Task EnsureSuccessOrThrowAsync(HttpResponseMessage res)
        {
            if (res.IsSuccessStatusCode) return;

            var body = await res.Content.ReadAsStringAsync();
            if (!string.IsNullOrWhiteSpace(body))
            {
                try
                {
                    using var doc = JsonDocument.Parse(body);
                    var root = doc.RootElement;
                    var title = root.TryGetProperty("title", out var t) ? t.GetString() : null;
                    var detail = root.TryGetProperty("detail", out var d) ? d.GetString() : null;
                    var msg = !string.IsNullOrWhiteSpace(detail) ? detail : (!string.IsNullOrWhiteSpace(title) ? title : body);
                    throw new InvalidOperationException(msg);
                }
                catch (JsonException)
                {
                    // fall through
                }
            }

            throw new InvalidOperationException($"Geo service call failed with status {(int)res.StatusCode} ({res.ReasonPhrase}).");
        }

        public record UpsertReq(string RefType, string RefId, double Latitude, double Longitude, double? Radius, string? AddressLabel);
        public record PlaceRes(Guid Id, string RefType, string RefId, double Latitude, double Longitude, double? Radius, string? AddressLabel);
        public record GooglePlaceDto(string Name, string Address, double Lat, double Lng, string? PhotoReference);

        public async Task<PlaceRes?> UpsertAsync(string refType, string refId, double lat, double lng, double? radius = null, string? address = null)
        {
            var req = new UpsertReq(refType, refId, lat, lng, radius, address);
            var res = await _http.PostAsJsonAsync("/api/places/upsert", req);
            if (!res.IsSuccessStatusCode) return null;
            return await res.Content.ReadFromJsonAsync<PlaceRes>();
        }

        public async Task<PlaceRes?> ByRefAsync(string refType, string refId)
        {
            var res = await _http.GetAsync($"/api/places/by-ref?refType={Uri.EscapeDataString(refType)}&refId={Uri.EscapeDataString(refId)}");
            if (!res.IsSuccessStatusCode) return null;
            return await res.Content.ReadFromJsonAsync<PlaceRes>();
        }

        public async Task<List<PlaceRes>> ListByTypeAsync(string refType)
        {
            var res = await _http.GetAsync($"/api/places/by-type?refType={Uri.EscapeDataString(refType)}");
            if (!res.IsSuccessStatusCode) return new List<PlaceRes>();
            return await res.Content.ReadFromJsonAsync<List<PlaceRes>>() ?? new List<PlaceRes>();
        }

        public async Task<bool> DeleteAsync(string refType, string refId)
        {
            var res = await _http.DeleteAsync($"/api/places/by-ref?refType={Uri.EscapeDataString(refType)}&refId={Uri.EscapeDataString(refId)}");
            return res.IsSuccessStatusCode;
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesGolbasiAsync()
        {
            var res = await _http.GetAsync("/api/google-places/golbasi");
            await EnsureSuccessOrThrowAsync(res);
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesPhotographersAsync()
        {
            var res = await _http.GetAsync("/api/google-places/photographers");
            await EnsureSuccessOrThrowAsync(res);
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesBakeriesAsync()
        {
            var res = await _http.GetAsync("/api/google-places/bakeries");
            await EnsureSuccessOrThrowAsync(res);
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesFloristsAsync()
        {
            var res = await _http.GetAsync("/api/google-places/florists");
            await EnsureSuccessOrThrowAsync(res);
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesMusicAsync()
        {
            var res = await _http.GetAsync("/api/google-places/music");
            await EnsureSuccessOrThrowAsync(res);
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<(byte[] bytes, string contentType)> GetGooglePlacePhotoAsync(string photoRef, int maxWidth = 480)
        {
            if (string.IsNullOrWhiteSpace(photoRef))
            {
                throw new ArgumentException("photoRef is required", nameof(photoRef));
            }

            var safeMaxWidth = Math.Clamp(maxWidth, 64, 1600);
            var url = $"/api/google-places/photo?photoRef={Uri.EscapeDataString(photoRef)}&maxWidth={safeMaxWidth}";

            using var res = await _http.GetAsync(url);
            await EnsureSuccessOrThrowAsync(res);

            var bytes = await res.Content.ReadAsByteArrayAsync();
            var contentType = res.Content.Headers.ContentType?.ToString() ?? "image/jpeg";

            return (bytes, contentType);
        }
    }
}
