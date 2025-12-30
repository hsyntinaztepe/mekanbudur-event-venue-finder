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

        // Legacy fields for migration (will be deprecated)
        public int? CategoryId { get; set; }
        public ServiceCategory? Category { get; set; }

        public decimal? Budget { get; set; }

        public List<EventListingItem> Items { get; set; } = new();

        public ListingStatus Status { get; set; } = ListingStatus.Open;
        
        public ListingVisibility Visibility { get; set; } = ListingVisibility.Active;

        public Guid CreatedByUserId { get; set; }
        public User CreatedByUser { get; set; } = default!;

        public List<Bid> Bids { get; set; } = new();

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        // Geo: İlan konumu Geo serviste tutulur (RefType="Listing", RefId=Id)
    }
}
