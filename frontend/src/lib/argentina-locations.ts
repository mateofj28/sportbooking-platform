// Provincias y localidades de Argentina desde la API oficial Georef
// (Ministerio del Interior). Catálogo completo y actualizado.
// Docs: https://datosgobar.github.io/georef-ar-api/

const GEOREF_BASE = "https://apis.datos.gob.ar/georef/api";

export interface Provincia {
  id: string;
  nombre: string;
}

export interface Localidad {
  id: string;
  nombre: string;
}

/** Obtiene las 24 provincias argentinas ordenadas por nombre. */
export async function fetchProvinces(): Promise<Provincia[]> {
  const res = await fetch(`${GEOREF_BASE}/provincias?campos=id,nombre&max=100`);
  if (!res.ok) throw new Error("No se pudieron cargar las provincias");
  const data = await res.json();
  return (data.provincias as Provincia[]).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es")
  );
}

/**
 * Obtiene todas las localidades de una provincia (por id de provincia).
 * Georef pagina de a 100, así que se recorren todas las páginas.
 */
export async function fetchLocalities(provinceId: string): Promise<Localidad[]> {
  if (!provinceId) return [];
  const MAX = 100;
  const first = await fetch(
    `${GEOREF_BASE}/localidades?provincia=${provinceId}&campos=id,nombre&max=${MAX}`
  );
  if (!first.ok) throw new Error("No se pudieron cargar las localidades");
  const firstData = await first.json();
  const total: number = firstData.total || 0;
  let localidades: Localidad[] = firstData.localidades || [];

  // Traer las páginas restantes en paralelo
  if (total > MAX) {
    const pages = Math.ceil(total / MAX);
    const requests: Promise<Localidad[]>[] = [];
    for (let p = 1; p < pages; p++) {
      requests.push(
        fetch(
          `${GEOREF_BASE}/localidades?provincia=${provinceId}&campos=id,nombre&max=${MAX}&inicio=${p * MAX}`
        )
          .then((r) => r.json())
          .then((d) => d.localidades || [])
      );
    }
    const rest = await Promise.all(requests);
    localidades = localidades.concat(...rest);
  }

  // Ordenar alfabéticamente y quitar duplicados por nombre
  const seen = new Set<string>();
  return localidades
    .filter((l) => {
      const key = l.nombre.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
