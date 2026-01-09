using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.DTOs
{
    public record BidCreateRequest(
        Guid EventListingId,
        List<BidItemDto> Items,
        string? Message
    );

    public record BidItemDto(Guid EventListingItemId, decimal Amount);

    public record BidResponse(
        Guid Id,
        Guid EventListingId,
        decimal TotalAmount,
        List<BidItemResponse> Items,
        string? Message,
        string VendorName,
        string Status,
        DateTime CreatedAtUtc,
        Guid VendorUserId,
        string? VendorPhoneNumber
    );

    public record BidItemResponse(
        Guid Id,
        Guid EventListingItemId,
        string CategoryName,
        decimal Amount
    );
}
