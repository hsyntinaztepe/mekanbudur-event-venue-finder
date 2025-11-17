using MekanBudur.Api.Models;
using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.DTOs
{
    public record RegisterRequest(
        [property: Required, EmailAddress] string Email,
        [property: Required, MinLength(6)] string Password,
        [property: Required] string DisplayName,
        string Role, // String olarak al, sonra enum'a parse et
        string? CompanyName,
        string? ServiceCategoriesCsv,
        // Geo for Vendor
        double? VenueLatitude,
        double? VenueLongitude,
        string? VenueAddressLabel
    );

    public record LoginRequest(
        [property: Required, EmailAddress] string Email,
        [property: Required] string Password
    );

    public record AuthResponse(string Token, string Role, string DisplayName);
}
