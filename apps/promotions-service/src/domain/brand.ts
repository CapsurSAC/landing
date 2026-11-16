export interface BrandProps {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly active: boolean;
}

/** Marca comercial del grupo (p. ej. `sis`). */
export class Brand {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly active: boolean;

  constructor(props: BrandProps) {
    this.id = props.id;
    this.name = props.name;
    this.displayName = props.displayName;
    this.active = props.active;
  }
}
