import type { HealthSample } from "@/lib/types";

// The one boundary that keeps the whole app swappable. Every device/provider
// implements this: the mock generator today, a Google Health API adapter when
// the Fitbit Air arrives, a Huawei Watch D2 adapter later for blood pressure.
// Nothing above this interface knows or cares which source produced the data.
export interface DataSource {
  readonly name: string;
  fetchSamples(opts: {
    personId: string;
    days: number;
    /** The most recent day to generate/fetch through. */
    until: Date;
  }): Promise<HealthSample[]>;
}
