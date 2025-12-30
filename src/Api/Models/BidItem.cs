using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace MekanBudur.Api.Models
{
    public class BidItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid BidId { get; set; }
        [JsonIgnore]
        public Bid Bid { get; set; } = default!;

        public Guid EventListingItemId { get; set; }
        public EventListingItem EventListingItem { get; set; } = default!;

        public decimal Amount { get; set; }
    }
}
