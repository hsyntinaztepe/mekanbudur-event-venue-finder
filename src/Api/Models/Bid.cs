using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.Models
{
    public class Bid
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid EventListingId { get; set; }
        public MekanBudur.Api.Models.EventListing EventListing { get; set; } = default!;

        public Guid VendorUserId { get; set; }
        public MekanBudur.Api.Models.User VendorUser { get; set; } = default!;

        public decimal Amount { get; set; }

        public List<BidItem> Items { get; set; } = new();

        [MaxLength(600)]
        public string? Message { get; set; }

        public BidStatus Status { get; set; } = BidStatus.Pending;
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    }
}
