/**
 * Tamil Nadu's 38 revenue districts (official set as of the Mayiladuthurai
 * / Ranipet / Tirupathur / Chengalpattu / Tenkasi expansions).
 *
 * `id` is the stable tenant key used on user.profile.districtId.
 * `slug` drives seed usernames (`dist-<slug>`, `teach-<slug>`, `stud-<slug>`).
 */
export const TAMIL_NADU_DISTRICTS = [
  { id: "tn-ariyalur", slug: "ariyalur", name: "Ariyalur" },
  { id: "tn-chengalpattu", slug: "chengalpattu", name: "Chengalpattu" },
  { id: "tn-chennai", slug: "chennai", name: "Chennai" },
  { id: "tn-coimbatore", slug: "coimbatore", name: "Coimbatore" },
  { id: "tn-cuddalore", slug: "cuddalore", name: "Cuddalore" },
  { id: "tn-dharmapuri", slug: "dharmapuri", name: "Dharmapuri" },
  { id: "tn-dindigul", slug: "dindigul", name: "Dindigul" },
  { id: "tn-erode", slug: "erode", name: "Erode" },
  { id: "tn-kallakurichi", slug: "kallakurichi", name: "Kallakurichi" },
  { id: "tn-kancheepuram", slug: "kancheepuram", name: "Kancheepuram" },
  { id: "tn-kanniyakumari", slug: "kanniyakumari", name: "Kanniyakumari" },
  { id: "tn-karur", slug: "karur", name: "Karur" },
  { id: "tn-krishnagiri", slug: "krishnagiri", name: "Krishnagiri" },
  { id: "tn-madurai", slug: "madurai", name: "Madurai" },
  { id: "tn-mayiladuthurai", slug: "mayiladuthurai", name: "Mayiladuthurai" },
  { id: "tn-nagapattinam", slug: "nagapattinam", name: "Nagapattinam" },
  { id: "tn-namakkal", slug: "namakkal", name: "Namakkal" },
  { id: "tn-nilgiris", slug: "nilgiris", name: "The Nilgiris" },
  { id: "tn-perambalur", slug: "perambalur", name: "Perambalur" },
  { id: "tn-pudukkottai", slug: "pudukkottai", name: "Pudukkottai" },
  { id: "tn-ramanathapuram", slug: "ramanathapuram", name: "Ramanathapuram" },
  { id: "tn-ranipet", slug: "ranipet", name: "Ranipet" },
  { id: "tn-salem", slug: "salem", name: "Salem" },
  { id: "tn-sivaganga", slug: "sivaganga", name: "Sivaganga" },
  { id: "tn-tenkasi", slug: "tenkasi", name: "Tenkasi" },
  { id: "tn-thanjavur", slug: "thanjavur", name: "Thanjavur" },
  { id: "tn-theni", slug: "theni", name: "Theni" },
  { id: "tn-thoothukudi", slug: "thoothukudi", name: "Thoothukudi" },
  { id: "tn-tiruchirappalli", slug: "tiruchirappalli", name: "Tiruchirappalli" },
  { id: "tn-tirunelveli", slug: "tirunelveli", name: "Tirunelveli" },
  { id: "tn-tirupathur", slug: "tirupathur", name: "Tirupathur" },
  { id: "tn-tiruppur", slug: "tiruppur", name: "Tiruppur" },
  { id: "tn-tiruvallur", slug: "tiruvallur", name: "Tiruvallur" },
  { id: "tn-tiruvannamalai", slug: "tiruvannamalai", name: "Tiruvannamalai" },
  { id: "tn-tiruvarur", slug: "tiruvarur", name: "Tiruvarur" },
  { id: "tn-vellore", slug: "vellore", name: "Vellore" },
  { id: "tn-viluppuram", slug: "viluppuram", name: "Viluppuram" },
  { id: "tn-virudhunagar", slug: "virudhunagar", name: "Virudhunagar" },
];

export const TAMIL_NADU_STATE = "Tamil Nadu";

/** Stable 11-digit-shaped demo UDISE codes (not real school codes). */
export function demoUdiseForDistrict(district, seq = 1) {
  const n = String(TAMIL_NADU_DISTRICTS.findIndex((d) => d.id === district.id) + 1).padStart(2, "0");
  const s = String(seq).padStart(3, "0");
  return `33${n}01${s}01`;
}

export function demoTeacherEmis(district, seq = 1) {
  return `TN-TCH-${district.slug.toUpperCase()}-${String(seq).padStart(3, "0")}`;
}

export function demoStudentEmis(district, seq = 1) {
  return `TN-STU-${district.slug.toUpperCase()}-${String(seq).padStart(3, "0")}`;
}
