const fs = require("fs");
const path = require("path");

const firstNames = ["Juan", "Maria", "Jose", "Ana", "Roberto", "Lorna", "Ramon", "Elena", "Antonio", "Carmen", "Eduardo", "Teresa", "Daniel", "Rosario", "Manuel", "Gloria", "Ricardo", "Luz", "Fernando", "Imelda"];
const lastNames = ["Dela Cruz", "Santos", "Reyes", "Garcia", "Mendoza", "Torres", "Flores", "Bautista", "Castillo", "Villanueva", "Ramos", "Aquino"];
const barangays = ["Barangay 1", "Barangay 2", "Barangay 3", "Barangay 4", "Barangay 5", "Barangay 6", "Barangay 7", "Barangay 8", "Barangay 9", "Barangay 10", "Barangay 11", "Cotta", "Dalahican", "Gulang-Gulang", "Ibabang Dupay", "Ilayang Dupay", "Isabang", "Market View", "Mayao Crossing", "Mayao Kanluran", "Mayao Parada", "Ransohan", "Salinas", "Talao-Talao"];
const routes = ["Lucena City Proper", "Dalahican-Poblacion", "Cotta-Market", "Gulang-Gulang-City Proper", "Dupay-City Proper", "Isabang-Poblacion", "Mayao-City Proper", "Talao-Talao-Market"];
const todas = ["Lucena Proper TODA", "Dalahican TODA", "Cotta TODA", "Gulang-Gulang TODA", "Dupay TODA", "Isabang TODA", "Mayao TODA", "Talao-Talao TODA"];
const brands = ["Honda TMX 125", "Honda TMX Supremo", "Yamaha YTX 125", "Kawasaki Barako II", "Suzuki GD 110", "Honda XRM 125"];
const statuses = ["active", "active", "active", "active", "active", "pending", "suspended", "expired", "revoked", "active"];
const civilStatuses = ["Married", "Single", "Married", "Widowed", "Separated"];
const streets = ["Rizal Street", "Quezon Avenue", "Mabini Street", "Bonifacio Drive", "Maharlika Highway", "Recto Street", "Diversion Road", "Granja Street"];

const headers = [
  "franchise_number", "operator_name", "route", "status", "application_type", "application_date", "expiration_date", "address", "contact_number", "previous_registration", "registration_month", "registration_day", "registration_year", "previous_mtop_expiration", "birth_date", "birth_place", "civil_status", "barangay_clearance_cedula", "toda_name", "official_receipt_number", "motorcycle_brand", "motorcycle_year_model", "engine_number", "engine_cr_number", "chassis_number", "chassis_cr_number", "plate_number", "driver_name", "driver_contact_number"
];

const pad = (value, width = 3) => String(value).padStart(width, "0");
const iso = (year, month, day) => `${year}-${pad(month, 2)}-${pad(day, 2)}`;
const csv = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const rows = Array.from({ length: 120 }, (_, offset) => {
  const n = offset + 1;
  const month = (offset % 12) + 1;
  const day = (offset % 27) + 1;
  const registrationYear = 2023 + (offset % 4);
  const status = statuses[offset % statuses.length];
  const applicationYear = status === "expired" ? 2023 : registrationYear;
  const expirationYear = status === "expired" ? 2025 : registrationYear + 3;
  const birthYear = 1965 + (offset % 31);
  const barangay = barangays[offset % barangays.length];
  const routeIndex = offset % routes.length;
  const operatorName = `${firstNames[offset % firstNames.length]} ${String.fromCharCode(65 + (offset % 26))}. ${lastNames[Math.floor(offset / firstNames.length) % lastNames.length]}`;
  const driverName = `${firstNames[(offset + 7) % firstNames.length]} ${String.fromCharCode(65 + ((offset + 11) % 26))}. ${lastNames[(offset + 5) % lastNames.length]}`;
  const values = {
    franchise_number: `SAMPLE-FR-2026-${pad(n)}`,
    operator_name: operatorName,
    route: routes[routeIndex],
    status,
    application_type: offset % 5 === 0 ? "new" : "renewal",
    application_date: iso(applicationYear, month, day),
    expiration_date: iso(expirationYear, month, day),
    address: `${100 + n} ${streets[offset % streets.length]}, ${barangay}, Lucena City`,
    contact_number: `0918${pad(1000000 + n, 7)}`,
    previous_registration: offset % 5 === 0 ? "None" : `SAMPLE-PREV-${pad(n)}`,
    registration_month: month,
    registration_day: day,
    registration_year: registrationYear,
    previous_mtop_expiration: iso(registrationYear, month, day),
    birth_date: iso(birthYear, month, Math.min(day, 25)),
    birth_place: offset % 6 === 0 ? "Tayabas City" : "Lucena City",
    civil_status: civilStatuses[offset % civilStatuses.length],
    barangay_clearance_cedula: `SAMPLE-BC-${pad(n)} / SAMPLE-CTC-${pad(n)}`,
    toda_name: todas[routeIndex],
    official_receipt_number: `SAMPLE-OR-2026-${pad(n)}`,
    motorcycle_brand: brands[offset % brands.length],
    motorcycle_year_model: 2018 + (offset % 9),
    engine_number: `SMP-ENG-${pad(n, 4)}`,
    engine_cr_number: `SMP-ECR-${pad(n, 4)}`,
    chassis_number: `SMP-CHS-${pad(n, 4)}`,
    chassis_cr_number: `SMP-CCR-${pad(n, 4)}`,
    plate_number: `SM-${pad(n, 4)}`,
    driver_name: driverName,
    driver_contact_number: `0928${pad(2000000 + n, 7)}`,
  };
  return headers.map((header) => csv(values[header])).join(",");
});

const output = [headers.join(","), ...rows].join("\r\n") + "\r\n";
fs.writeFileSync(path.join(__dirname, "csv", "franchises-import.csv"), output, "utf8");
console.log(`Generated ${rows.length} franchise sample records.`);
