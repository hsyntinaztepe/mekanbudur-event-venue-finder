using MekanBudur.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace MekanBudur.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) {}

        public DbSet<User> Users => Set<User>();
        public DbSet<VendorProfile> VendorProfiles => Set<VendorProfile>();
        public DbSet<ServiceCategory> ServiceCategories => Set<ServiceCategory>();
        public DbSet<EventListing> EventListings => Set<EventListing>();
        public DbSet<Bid> Bids => Set<Bid>();

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
