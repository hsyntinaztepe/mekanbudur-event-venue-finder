namespace MekanBudur.Api.Models
{
    public enum UserRole
    {
        User = 0,
        Vendor = 1,
        Admin = 2
    }

    public enum ListingStatus
    {
        Open = 0,
        Awarded = 1,
        Closed = 2
    }

    public enum ListingVisibility
    {
        Passive = 0,    // Pasif - kullanıcı gizledi
        Active = 1,     // Aktif - yayında
        Deleted = 2     // Silindi - soft delete
    }

    public enum BidStatus
    {
        Pending = 0,
        Accepted = 1,
        Rejected = 2
    }
}
