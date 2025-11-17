using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.DTOs
{
    public record BidCreateRequest(
        [property: Required] Guid EventListingId,
        [property: Range(1, double.MaxValue)] decimal Amount,
        string? Message
    );

    public record BidResponse(
        Guid Id,
        Guid EventListingId,
        decimal Amount,
        string? Message,
        string VendorDisplayName,
        string Status,
        DateTime CreatedAtUtc
    );
}
