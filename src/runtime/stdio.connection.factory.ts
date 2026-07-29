import type { IConnectionFactory } from "./connection.factory.interface";
import type { IConnection } from "./connection.interface";
import { type SpawnFunction, StdioConnection } from "./stdio.connection";
import type { SpawnOptions } from "./types";

export class StdioConnectionFactory implements IConnectionFactory {
  constructor(private readonly spawnFn?: SpawnFunction) {}

  create(options: SpawnOptions): IConnection {
    return new StdioConnection(options, this.spawnFn);
  }
}
