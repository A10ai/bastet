import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingBag,
  Compass,
  Umbrella,
  Car,
  UtensilsCrossed,
  Bed,
  MapPin,
  Clock,
  Star,
} from "lucide-react";

/* ── data ─────────────────────────────────────────────────────────── */

interface Service {
  name: string;
  price: string;
  description: string;
}

interface Category {
  title: string;
  icon: React.ReactNode;
  color: string;          // tailwind ring/border accent
  bgColor: string;        // icon background
  services: Service[];
}

const categories: Category[] = [
  {
    title: "Excursions & Tours",
    icon: <Compass className="w-5 h-5 text-cyan-400" />,
    color: "border-cyan-400/30",
    bgColor: "bg-cyan-400/10",
    services: [
      { name: "Giftun Island Snorkeling", price: "£35/person", description: "Full-day island trip with snorkeling, lunch, and boat transfers included." },
      { name: "Luxor Day Trip", price: "£85/person", description: "Guided tour of the Valley of the Kings, Karnak Temple, and Hatshepsut Temple." },
      { name: "Desert Safari Quad Bikes", price: "£45/person", description: "2-hour sunset quad-bike adventure through the Eastern Desert with Bedouin tea stop." },
      { name: "Glass Bottom Boat", price: "£25/person", description: "90-minute reef viewing cruise over Hurghada's coral gardens." },
    ],
  },
  {
    title: "Beach & Pool",
    icon: <Umbrella className="w-5 h-5 text-cyan-300" />,
    color: "border-cyan-300/30",
    bgColor: "bg-cyan-300/10",
    services: [
      { name: "Beach Sunbed (daily)", price: "£8/day", description: "Reserved front-row sunbed with umbrella on the private beach." },
      { name: "Pool Towel Set", price: "£3", description: "Two large premium cotton pool towels — collect from reception." },
      { name: "Private Cabana", price: "£50/day", description: "Shaded VIP cabana with lounge seating, minibar, and dedicated service." },
    ],
  },
  {
    title: "Transport",
    icon: <Car className="w-5 h-5 text-emerald-400" />,
    color: "border-emerald-400/30",
    bgColor: "bg-emerald-400/10",
    services: [
      { name: "Airport Transfer (one way)", price: "£15", description: "Air-conditioned private transfer from Hurghada International Airport." },
      { name: "Airport Transfer (return)", price: "£25", description: "Return airport transfer — driver meets you at arrivals and collects at checkout." },
      { name: "City Tour Shuttle", price: "£10", description: "Scheduled shuttle to Hurghada Marina, Dahar souk, and El Gouna." },
      { name: "Private Car (half day)", price: "£40", description: "4-hour private car and driver for custom sightseeing or shopping trips." },
    ],
  },
  {
    title: "Dining & Wellness",
    icon: <UtensilsCrossed className="w-5 h-5 text-amber-400" />,
    color: "border-amber-400/30",
    bgColor: "bg-amber-400/10",
    services: [
      { name: "Breakfast Upgrade (buffet)", price: "£12/day", description: "Full international breakfast buffet with fresh juice, pastries, and hot station." },
      { name: "BBQ Night (Friday)", price: "£20/person", description: "Poolside BBQ with live grill, salad bar, desserts, and soft drinks." },
      { name: "Spa Massage (60min)", price: "£35", description: "Choice of Swedish, deep-tissue, or hot-stone massage at the in-house spa." },
      { name: "Yoga Class", price: "£8/session", description: "Morning rooftop yoga session — mats and water provided. All levels welcome." },
    ],
  },
  {
    title: "Room Extras",
    icon: <Bed className="w-5 h-5 text-violet-400" />,
    color: "border-violet-400/30",
    bgColor: "bg-violet-400/10",
    services: [
      { name: "Late Checkout (2PM)", price: "£15", description: "Extend your checkout to 2 PM — subject to availability." },
      { name: "Early Check-in (10AM)", price: "£15", description: "Guaranteed room access from 10 AM on arrival day." },
      { name: "Extra Cleaning", price: "£10", description: "Additional mid-stay deep clean with fresh linen and towel change." },
      { name: "Baby Cot", price: "Free", description: "Wooden baby cot with mattress and bedding delivered to your room." },
      { name: "Mini Fridge Restock", price: "£20", description: "Full restock of water, soft drinks, juice, and snacks in your mini fridge." },
    ],
  },
];

const totalServices = categories.reduce((sum, c) => sum + c.services.length, 0);

/* ── page ─────────────────────────────────────────────────────────── */

export default function MarketplacePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-display font-bold text-text-primary">Marketplace</h1>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          Guest services, excursions, and add-ons
        </p>
      </div>

      {/* Summary strip */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 py-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-cyan-400/10 flex items-center justify-center">
              <Star className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-text-primary">{totalServices}</p>
              <p className="text-xs text-text-secondary -mt-0.5">services available</p>
            </div>
          </div>

          <div className="h-8 w-px bg-bastet-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-cyan-400/10 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-text-primary">{categories.length}</p>
              <p className="text-xs text-text-secondary -mt-0.5">categories</p>
            </div>
          </div>

          <div className="h-8 w-px bg-bastet-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-text-secondary leading-snug">
                Online booking <span className="text-amber-400 font-medium">coming soon</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category sections */}
      {categories.map((category) => (
        <section key={category.title} className="space-y-3">
          {/* Category heading */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg ${category.bgColor} flex items-center justify-center`}>
                {category.icon}
              </div>
              <h2 className="text-lg font-display font-semibold text-text-primary">
                {category.title}
              </h2>
              <Badge className="ml-1">{category.services.length} services</Badge>
            </div>
          </div>

          {/* Service cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {category.services.map((service) => (
              <Card key={service.name} className={`${category.color} hover:border-cyan-400/40 transition-colors`}>
                <CardContent className="flex flex-col justify-between h-full py-4">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-text-primary leading-tight">
                        {service.name}
                      </h3>
                      <span
                        className={`shrink-0 text-sm font-bold ${
                          service.price === "Free" ? "text-emerald-400" : "text-cyan-400"
                        }`}
                      >
                        {service.price}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed mt-1">
                      {service.description}
                    </p>
                  </div>
                  <div className="mt-3">
                    <Button variant="secondary" size="sm" disabled className="w-full text-xs">
                      Add to Booking — Coming Soon
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
