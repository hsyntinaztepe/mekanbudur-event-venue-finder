using System.Collections.Generic;
using System.Net.Http.Json;

namespace MekanBudur.Api.Services
{
    public class GeoClient
    {
        private readonly HttpClient _http;
        public GeoClient(HttpClient http) => _http = http;

        public record UpsertReq(string RefType, string RefId, double Latitude, double Longitude, double? Radius, string? AddressLabel);
        public record PlaceRes(Guid Id, string RefType, string RefId, double Latitude, double Longitude, double? Radius, string? AddressLabel);
        public record GooglePlaceDto(string Name, string Address, double Lat, double Lng);

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
            res.EnsureSuccessStatusCode();
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesPhotographersAsync()
        {
            var res = await _http.GetAsync("/api/google-places/photographers");
            res.EnsureSuccessStatusCode();
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesBakeriesAsync()
        {
            var res = await _http.GetAsync("/api/google-places/bakeries");
            res.EnsureSuccessStatusCode();
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesFloristsAsync()
        {
            var res = await _http.GetAsync("/api/google-places/florists");
            res.EnsureSuccessStatusCode();
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }

        public async Task<List<GooglePlaceDto>> GetGooglePlacesMusicAsync()
        {
            var res = await _http.GetAsync("/api/google-places/music");
            res.EnsureSuccessStatusCode();
            return await res.Content.ReadFromJsonAsync<List<GooglePlaceDto>>() ?? new List<GooglePlaceDto>();
        }
    }
}
