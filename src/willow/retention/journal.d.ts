declare module '@runeditrun/rer/modules/portability/journal' {
  export function erasureStatements(db: D1Database, table: string, primaryKey: Record<string, string | number | null>): Promise<D1PreparedStatement[]>
  export function redactionStatements(db: D1Database): Promise<D1PreparedStatement[]>
  export function invalidateTransfersStatements(db: D1Database): Promise<D1PreparedStatement[]>
}
