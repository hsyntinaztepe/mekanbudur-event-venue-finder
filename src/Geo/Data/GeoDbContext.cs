using GeoService.Models;
using Microsoft.EntityFrameworkCore;

namespace GeoService.Data
{
    public class GeoDbContext : DbContext
    {
        public GeoDbContext(DbContextOptions<GeoDbContext> options) : base(options) {}

        public DbSet<Place> Places => Set<Place>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<Place>()
                .HasIndex(p => new { p.RefType, p.RefId })
                .IsUnique();
        }
    }
}
