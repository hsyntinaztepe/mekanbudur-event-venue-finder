using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.DTOs
{
    public record ListingCreateRequest(
        [property: Required] string Title,
        string? Description,
        DateTime EventDate,
        string? Location,
        [property: Range(1, double.MaxValue)] decimal Budget,
        int CategoryId,
        // Geo (optional but önerilir)
        double? Latitude,
        double? Longitude,
        double? Radius,
        string? AddressLabel
    );

    public record ListingResponse(
        Guid Id,
        string Title,
        string? Description,
        DateTime EventDate,
        string? Location,
        decimal Budget,
        int CategoryId,
        string CategoryName,
        string OwnerDisplayName,
        string Status,
        DateTime CreatedAtUtc,
        // Geo
        double? Latitude,
        double? Longitude,
        double? Radius,
        string? AddressLabel
    );
}
