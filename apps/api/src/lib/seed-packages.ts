import { prisma } from "@tripeseats/database";

const PACKAGES = [
  {
    name: "Package 1",
    sortOrder: 1,
    minGuests: 200,
    items: [
      { label: "Appetizer", quantity: 1 },
      { label: "Veg Gravy", quantity: 1 },
      { label: "Chicken Gravy", quantity: 1 },
      { label: "Rice Chicken", quantity: 1 },
      { label: "Grill", quantity: 1 },
      { label: "Dessert", quantity: 1 },
      { label: "Naan", quantity: 1 },
      { label: "Salad", quantity: 1 },
      { label: "Raita", quantity: 1 },
      { label: "Mirchi Ka Salan", quantity: 1 }
    ],
    tiers: [
      { minGuests: 200, maxGuests: 250, pricePerHead: 19 },
      { minGuests: 251, maxGuests: 350, pricePerHead: 16 },
      { minGuests: 351, maxGuests: 450, pricePerHead: 15 },
      { minGuests: 451, maxGuests: null, pricePerHead: 15 }
    ]
  },
  {
    name: "Package 2",
    sortOrder: 2,
    minGuests: 200,
    items: [
      { label: "Appetizer", quantity: 2 },
      { label: "Veg Gravy", quantity: 1 },
      { label: "Chicken Gravy", quantity: 1 },
      { label: "Mutton Gravy", quantity: 1 },
      { label: "Rice Chicken", quantity: 1 },
      { label: "Grill", quantity: 1 },
      { label: "Dessert", quantity: 2 },
      { label: "Naan", quantity: 1 },
      { label: "Salad", quantity: 1 },
      { label: "Raita", quantity: 1 },
      { label: "Mirchi Ka Salan", quantity: 1 }
    ],
    tiers: [
      { minGuests: 200, maxGuests: 250, pricePerHead: 20 },
      { minGuests: 251, maxGuests: 350, pricePerHead: 17 },
      { minGuests: 351, maxGuests: 450, pricePerHead: 16 },
      { minGuests: 451, maxGuests: null, pricePerHead: 16 }
    ]
  },
  {
    name: "Package 3",
    sortOrder: 3,
    minGuests: 200,
    items: [
      { label: "Appetizer", quantity: 3 },
      { label: "Veg Gravy", quantity: 1 },
      { label: "Chicken Gravy", quantity: 1 },
      { label: "Mutton Gravy", quantity: 1 },
      { label: "Rice Chicken", quantity: 1 },
      { label: "Grill", quantity: 1 },
      { label: "Dessert", quantity: 2 },
      { label: "Naan", quantity: 1 },
      { label: "Salad", quantity: 1 },
      { label: "Raita", quantity: 1 },
      { label: "Mirchi Ka Salan", quantity: 1 }
    ],
    tiers: [
      { minGuests: 200, maxGuests: 250, pricePerHead: 21 },
      { minGuests: 251, maxGuests: 350, pricePerHead: 18 },
      { minGuests: 351, maxGuests: 450, pricePerHead: 18 },
      { minGuests: 451, maxGuests: null, pricePerHead: 18 }
    ]
  }
];

export async function seedPackagesForCaterer(catererId: string) {
  for (const pkg of PACKAGES) {
    const existing = await prisma.cateringPackage.findFirst({
      where: { catererId, name: pkg.name }
    });
    if (existing) continue;

    await prisma.cateringPackage.create({
      data: {
        catererId,
        name: pkg.name,
        sortOrder: pkg.sortOrder,
        minGuests: pkg.minGuests,
        tiers: { create: pkg.tiers },
        items: {
          create: pkg.items.map((item, i) => ({
            ...item,
            sortOrder: i
          }))
        }
      }
    });
  }
}
