import type { IConnection } from "./connection.interface";
import type { SpawnOptions } from "./types";

export interface IConnectionFactory {
  create(options: SpawnOptions): IConnection;
}
