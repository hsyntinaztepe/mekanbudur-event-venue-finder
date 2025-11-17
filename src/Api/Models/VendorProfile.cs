using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.Models
{
    public class VendorProfile
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid UserId { get; set; }
        public User User { get; set; } = default!;

        [Required, MaxLength(160)]
        public string CompanyName { get; set; } = default!;

        [MaxLength(500)]
        public string? Description { get; set; }

        [MaxLength(250)]
        public string? ServiceCategoriesCsv { get; set; }

        // Geo: Vendor mekan konumu Geo serviste tutulur (RefType="Vendor", RefId=UserId)
    }
}
