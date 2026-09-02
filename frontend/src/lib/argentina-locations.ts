// Provincias de Argentina y sus principales localidades.
// Usado en el formulario de sedes (provincia -> localidad).

export const ARGENTINA_PROVINCES: Record<string, string[]> = {
  "Buenos Aires": [
    "La Plata", "Mar del Plata", "Bahía Blanca", "Tandil", "Quilmes",
    "Lanús", "Avellaneda", "San Isidro", "Vicente López", "Morón",
    "La Matanza", "Lomas de Zamora", "Tigre", "Pilar", "Junín",
    "Olavarría", "Pergamino", "Necochea", "Campana", "Zárate",
  ],
  "Ciudad Autónoma de Buenos Aires": [
    "Palermo", "Recoleta", "Belgrano", "Caballito", "Flores",
    "Villa Urquiza", "Almagro", "Núñez", "San Telmo", "Puerto Madero",
    "Villa Devoto", "Barracas", "Boedo", "Chacarita", "Villa Crespo",
  ],
  "Catamarca": ["San Fernando del Valle de Catamarca", "Andalgalá", "Belén", "Tinogasta", "Santa María"],
  "Chaco": ["Resistencia", "Barranqueras", "Presidencia Roque Sáenz Peña", "Villa Ángela", "Charata"],
  "Chubut": ["Rawson", "Comodoro Rivadavia", "Puerto Madryn", "Trelew", "Esquel"],
  "Córdoba": [
    "Córdoba", "Río Cuarto", "Villa María", "Villa Carlos Paz", "San Francisco",
    "Alta Gracia", "Río Tercero", "Bell Ville", "Jesús María", "La Falda",
  ],
  "Corrientes": ["Corrientes", "Goya", "Mercedes", "Curuzú Cuatiá", "Paso de los Libres"],
  "Entre Ríos": ["Paraná", "Concordia", "Gualeguaychú", "Concepción del Uruguay", "Gualeguay", "Victoria"],
  "Formosa": ["Formosa", "Clorinda", "Pirané", "El Colorado", "Las Lomitas"],
  "Jujuy": ["San Salvador de Jujuy", "Palpalá", "Perico", "Libertador General San Martín", "San Pedro"],
  "La Pampa": ["Santa Rosa", "General Pico", "Toay", "Realicó", "Eduardo Castex"],
  "La Rioja": ["La Rioja", "Chilecito", "Aimogasta", "Chamical", "Chepes"],
  "Mendoza": ["Mendoza", "San Rafael", "Godoy Cruz", "Guaymallén", "Luján de Cuyo", "Maipú", "San Martín", "Tunuyán"],
  "Misiones": ["Posadas", "Oberá", "Eldorado", "Puerto Iguazú", "Apóstoles"],
  "Neuquén": ["Neuquén", "Cutral Có", "Plottier", "Zapala", "San Martín de los Andes", "Villa La Angostura"],
  "Río Negro": ["Viedma", "San Carlos de Bariloche", "General Roca", "Cipolletti", "Villa Regina"],
  "Salta": ["Salta", "San Ramón de la Nueva Orán", "Tartagal", "Metán", "Cafayate"],
  "San Juan": ["San Juan", "Rawson", "Chimbas", "Rivadavia", "Pocito", "Caucete"],
  "San Luis": ["San Luis", "Villa Mercedes", "Merlo", "La Punta", "Justo Daract"],
  "Santa Cruz": ["Río Gallegos", "Caleta Olivia", "El Calafate", "Pico Truncado", "Puerto Deseado"],
  "Santa Fe": [
    "Santa Fe", "Rosario", "Rafaela", "Venado Tuerto", "Reconquista",
    "Santo Tomé", "Villa Gobernador Gálvez", "Esperanza", "San Lorenzo",
  ],
  "Santiago del Estero": ["Santiago del Estero", "La Banda", "Termas de Río Hondo", "Añatuya", "Frías"],
  "Tierra del Fuego": ["Ushuaia", "Río Grande", "Tolhuin"],
  "Tucumán": ["San Miguel de Tucumán", "Yerba Buena", "Tafí Viejo", "Concepción", "Aguilares", "Banda del Río Salí"],
};

export const PROVINCE_NAMES = Object.keys(ARGENTINA_PROVINCES).sort();

export function getLocalities(province: string): string[] {
  return ARGENTINA_PROVINCES[province] || [];
}
