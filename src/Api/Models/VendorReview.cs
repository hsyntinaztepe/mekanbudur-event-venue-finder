using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.Models
{
    public class VendorReview
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid VendorUserId { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required, MaxLength(1000)]
        public string Comment { get; set; } = string.Empty;

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime? UpdatedAtUtc { get; set; }

        public User? User { get; set; }
        public User? VendorUser { get; set; }
    }
}
