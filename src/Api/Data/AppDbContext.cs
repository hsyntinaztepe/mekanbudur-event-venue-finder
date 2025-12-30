using MekanBudur.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace MekanBudur.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) {}

        public DbSet<User> Users { get; set; } = default!;
        public DbSet<VendorProfile> VendorProfiles { get; set; } = default!;
        public DbSet<ServiceCategory> ServiceCategories { get; set; } = default!;
        public DbSet<EventListing> EventListings { get; set; } = default!;
        public DbSet<EventListingItem> EventListingItems { get; set; } = default!;
        public DbSet<Bid> Bids { get; set; } = default!;
        public DbSet<BidItem> BidItems { get; set; } = default!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email).IsUnique();

            modelBuilder.Entity<User>()
                .HasMany(u => u.ListingsCreated)
                .WithOne(l => l.CreatedByUser)
                .HasForeignKey(l => l.CreatedByUserId);

            modelBuilder.Entity<VendorProfile>()
                .HasOne(v => v.User)
                .WithOne(u => u.VendorProfile!)
                .HasForeignKey<VendorProfile>(v => v.UserId);

            modelBuilder.Entity<EventListing>()
                .HasOne(l => l.Category)
                .WithMany()
                .HasForeignKey(l => l.CategoryId);

            modelBuilder.Entity<Bid>()
                .HasOne(b => b.EventListing)
                .WithMany(l => l.Bids)
                .HasForeignKey(b => b.EventListingId);

            modelBuilder.Entity<Bid>()
                .HasOne(b => b.VendorUser)
                .WithMany()
                .HasForeignKey(b => b.VendorUserId);
        }
    }
}
