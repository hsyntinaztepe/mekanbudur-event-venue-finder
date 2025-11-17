using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.Models
{
    public class EventListing
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required, MaxLength(140)]
        public string Title { get; set; } = default!;

        [MaxLength(1000)]
        public string? Description { get; set; }

        public DateTime EventDate { get; set; } = DateTime.UtcNow.AddDays(30);

        [MaxLength(120)]
        public string? Location { get; set; }

        public int CategoryId { get; set; }
        public ServiceCategory Category { get; set; } = default!;

        public decimal Budget { get; set; }

        public ListingStatus Status { get; set; } = ListingStatus.Open;

        public Guid CreatedByUserId { get; set; }
        public User CreatedByUser { get; set; } = default!;

        public List<Bid> Bids { get; set; } = new();

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        // Geo: İlan konumu Geo serviste tutulur (RefType="Listing", RefId=Id)
    }
}
