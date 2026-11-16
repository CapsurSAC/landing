import { type SpecialtyTrack } from './types';

export interface SpecialtyProps {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly track: SpecialtyTrack;
  readonly summary: string;
  readonly audience: readonly string[];
  readonly modality: string;
  readonly endorsedBy: string | null;
  readonly sortOrder: number;
  readonly active: boolean;
}

/** Especialidad o carrera ofrecida por una marca. */
export class Specialty {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly track: SpecialtyTrack;
  readonly summary: string;
  readonly audience: readonly string[];
  readonly modality: string;
  readonly endorsedBy: string | null;
  readonly sortOrder: number;
  readonly active: boolean;

  constructor(props: SpecialtyProps) {
    this.id = props.id;
    this.brandId = props.brandId;
    this.name = props.name;
    this.shortName = props.shortName;
    this.track = props.track;
    this.summary = props.summary;
    this.audience = [...props.audience];
    this.modality = props.modality;
    this.endorsedBy = props.endorsedBy;
    this.sortOrder = props.sortOrder;
    this.active = props.active;
  }
}
