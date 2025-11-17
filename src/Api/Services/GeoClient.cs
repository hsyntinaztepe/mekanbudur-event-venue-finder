using System.Net.Http.Json;

namespace MekanBudur.Api.Services
{
    public class GeoClient
    {
        private readonly HttpClient _http;
        public GeoClient(HttpClient http) => _http = http;

        public record UpsertReq(string RefType, string RefId, double Latitude, double Longitude, double? Radius, string? AddressLabel);
        public record PlaceRes(Guid Id, string RefType, string RefId, double Latitude, double Longitude, double? Radius, string? AddressLabel);

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
    }
}
