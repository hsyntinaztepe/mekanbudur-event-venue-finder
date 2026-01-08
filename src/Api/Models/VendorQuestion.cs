using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.Models
{
    public class VendorQuestion
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid VendorUserId { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required, MaxLength(500)]
        public string Question { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string? Answer { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime? AnsweredAtUtc { get; set; }

        public User? User { get; set; }
        public User? VendorUser { get; set; }
    }
}
