using System.ComponentModel.DataAnnotations;
using MekanBudur.Api.Models;

namespace MekanBudur.Api.DTOs
{
    public record ListingCreateRequest(
        string Title,
        string Description,
        DateTime EventDate,
        string Location,
        List<ListingItemDto> Items,
        // Geo (optional but önerilir)
        double? Latitude,
        double? Longitude,
        double? Radius,
        string? AddressLabel
    );

    public record ListingItemDto(int CategoryId, decimal Budget);

    public record ListingResponse(
        Guid Id,
        string Title,
        string? Description,
        DateTime EventDate,
        string? Location,
        decimal TotalBudget,
        List<ListingItemResponse> Items,
        Guid CreatedByUserId,
        string CreatedBy,
        string Status,
        DateTime CreatedAtUtc,
        // Geo
        double? Latitude,
        double? Longitude,
        double? Radius,
        string? AddressLabel,
        // Visibility
        ListingVisibility Visibility
    );

    public record ListingItemResponse(
        Guid Id,
        int CategoryId,
        string CategoryName,
        decimal Budget,
        string Status
    );

    public record VisibilityUpdateRequest(
        [Required] ListingVisibility Visibility
    );
}
