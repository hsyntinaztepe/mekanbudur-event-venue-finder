namespace MekanBudur.Api.Models
{
    public enum UserRole
    {
        User = 0,
        Vendor = 1
    }

    public enum ListingStatus
    {
        Open = 0,
        Awarded = 1,
        Closed = 2
    }

    public enum BidStatus
    {
        Pending = 0,
        Accepted = 1,
        Rejected = 2
    }
}
