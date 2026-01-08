using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.Models
{
    public class VendorRating
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid VendorUserId { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Range(1, 5)]
        public int Rating { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAtUtc { get; set; }

        public User? User { get; set; }
        public User? VendorUser { get; set; }
    }
}
