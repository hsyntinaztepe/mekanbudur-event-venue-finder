using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.DTOs
{
    public record VendorProfileUpdateRequest(
        [property: Required] string CompanyName,
        string? Description,
        string? VenueType,
        int? Capacity,
        string? Amenities,
        string? PriceRange,
        string? PhoneNumber,
        string? Website,
        string? SocialMediaLinks,
        string? WorkingHours,
        string? PhotoUrls,
        string? ServiceCategoriesCsv,
        string? SuitableForCsv,
        // Geo data
        double? VenueLatitude,
        double? VenueLongitude,
        string? VenueAddressLabel
    );

    public record VendorProfileResponse(
        Guid Id,
        Guid UserId,
        string CompanyName,
        string? Description,
        string? VenueType,
        int? Capacity,
        string? Amenities,
        string? PriceRange,
        string? PhoneNumber,
        string? Website,
        string? SocialMediaLinks,
        string? WorkingHours,
        string? PhotoUrls,
        string? ServiceCategoriesCsv,
        string? SuitableForCsv,
        bool IsVerified,
        DateTime CreatedAtUtc,
        DateTime? UpdatedAtUtc,
        // Geo data
        double? VenueLatitude,
        double? VenueLongitude,
        double? Radius,
        string? VenueAddressLabel
    );

    public record VendorMapItem(
        Guid UserId,
        Guid ProfileId,
        string CompanyName,
        string DisplayName,
        IReadOnlyList<string> ServiceCategories,
        IReadOnlyList<string> SuitableFor,
        bool IsVerified,
        string? VenueType,
        int? Capacity,
        string? Amenities,
        string? PriceRange,
        string? PhoneNumber,
        string? Website,
        string? CoverPhotoUrl,
        double? AverageRating,
        int RatingCount,
        double Latitude,
        double Longitude,
        double? Radius,
        string? AddressLabel
    );

    public record VendorRatingUpsertRequest(
        [property: Range(1, 5)] int Rating
    );

    public record VendorRatingSummary(
        double? AverageRating,
        int RatingCount,
        int? MyRating
    );

    public record VendorPublicProfileResponse(
        Guid VendorUserId,
        Guid ProfileId,
        string CompanyName,
        string DisplayName,
        IReadOnlyList<string> ServiceCategories,
        string? SuitableForCsv,
        bool IsVerified,
        string? Description,
        string? VenueType,
        int? Capacity,
        string? PriceRange,
        string? PhoneNumber,
        string? Website,
        string? PhotoUrls,
        double? AverageRating,
        int RatingCount,
        double? Latitude,
        double? Longitude,
        string? AddressLabel
    );

    public record VendorReviewUpsertRequest(
        [property: Required, MaxLength(1000)] string Comment
    );

    public record VendorReviewResponse(
        Guid Id,
        Guid VendorUserId,
        Guid UserId,
        string UserDisplayName,
        string Comment,
        DateTime CreatedAtUtc,
        DateTime? UpdatedAtUtc
    );

    public record VendorQuestionCreateRequest(
        [property: Required, MaxLength(500)] string Question
    );

    public record VendorQuestionResponse(
        Guid Id,
        Guid VendorUserId,
        Guid UserId,
        string UserDisplayName,
        string Question,
        string? Answer,
        DateTime CreatedAtUtc,
        DateTime? AnsweredAtUtc
    );

    public record AdminVendorResponse(
        Guid UserId,
        Guid ProfileId,
        string CompanyName,
        string Email,
        string? DisplayName,
        bool IsVerified,
        string? VenueType,
        int? Capacity,
        string? PriceRange,
        string? PhoneNumber,
        string? ServiceCategoriesCsv,
        string? SuitableForCsv,
        DateTime CreatedAtUtc,
        DateTime? UpdatedAtUtc,
        double? Latitude,
        double? Longitude,
        string? AddressLabel
    );
}
