import { describe, expect, it } from "vitest";
import { notificationSessionId } from "../src/domain/session.notification";

describe("notificationSessionId", () => {
  it("prefers camelCase sessionId for stream filtering", () => {
    expect(
      notificationSessionId({
        sessionId: "camel",
        session_id: "snake",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" } },
      } as never)
    ).toBe("camel");
  });

  it("vendorOnly reads only session_id for persistence", () => {
    expect(
      notificationSessionId(
        {
          sessionId: "camel",
          session_id: "snake",
          update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" } },
        } as never,
        { vendorOnly: true }
      )
    ).toBe("snake");
  });

  it("returns undefined when neither field is present", () => {
    expect(
      notificationSessionId({
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "x" } },
      } as never)
    ).toBeUndefined();
  });
});
