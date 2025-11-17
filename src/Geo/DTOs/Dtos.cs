using System.ComponentModel.DataAnnotations;

namespace GeoService.DTOs
{
    public record PlaceUpsertRequest(
        [property: Required] string RefType,
        [property: Required] string RefId,
        [property: Required] double Latitude,
        [property: Required] double Longitude,
        double? Radius,
        string? AddressLabel
    );

    public record PlaceResponse(
        Guid Id,
        string RefType,
        string RefId,
        double Latitude,
        double Longitude,
        double? Radius,
        string? AddressLabel
    );
}
