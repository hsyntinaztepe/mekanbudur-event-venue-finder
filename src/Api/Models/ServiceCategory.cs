using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.Models
{
    public class ServiceCategory
    {
        public int Id { get; set; }
        [Required, MaxLength(80)]
        public string Name { get; set; } = default!;
    }
}
