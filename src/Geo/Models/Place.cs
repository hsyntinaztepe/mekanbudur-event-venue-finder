using System.ComponentModel.DataAnnotations;

namespace GeoService.Models
{
    public class Place
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required, MaxLength(50)]
        public string RefType { get; set; } = default!; // "Listing" | "Vendor"

        [Required, MaxLength(64)]
        public string RefId { get; set; } = default!;   // GUID string of listing or vendor/user

        public double Latitude { get; set; }
        public double Longitude { get; set; }

        public double? Radius { get; set; } // Metre cinsinden yarıçap (çember alanı için)

        [MaxLength(200)]
        public string? AddressLabel { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAtUtc { get; set; }
    }
}
