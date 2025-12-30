using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace MekanBudur.Api.Models
{
    public class EventListingItem
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid EventListingId { get; set; }
        [JsonIgnore]
        public EventListing EventListing { get; set; } = default!;

        public int ServiceCategoryId { get; set; }
        public ServiceCategory ServiceCategory { get; set; } = default!;

        public decimal Budget { get; set; }

        public ListingStatus Status { get; set; } = ListingStatus.Open;
    }
}
