import { createNanoEvents } from "nanoevents";
import { useCallback, useEffect, useRef } from "react";
import { batchUpdate } from "./raf-queue";
import { useEffectEvent } from "../hook-utils/effect-event";
import invariant from "tiny-invariant";

const apiTokenKey = "__webstudio__$__api_token";

declare global {
  interface Window {
    [apiTokenKey]: string | undefined;
  }
}

const getRandomToken = () => {
  const randomBytes = new Uint8Array(10);
  window.crypto.getRandomValues(randomBytes);
  return btoa(String.fromCharCode(...randomBytes));
};

export const createPubsub = <PublishMap>() => {
  type Action<Type extends keyof PublishMap> =
    PublishMap[Type] extends undefined
      ? { type: Type; payload?: undefined }
      : { type: Type; payload: PublishMap[Type] };

  if (typeof window === "undefined") {
    return {
      publish: () => {
        throw new Error("publish is not available in this environment");
      },
      usePublish: () => {
        throw new Error("usePublish is not available in this environment");
      },
      useSubscribe: () => {
        throw new Error("useSubscribe is not available in this environment");
      },
      subscribe: () => {
        throw new Error("subscribe is not available in this environment");
      },
    } as never; // Prevent type exposure
  }

  /**
   * To avoid postMessage interception from the canvas, i.e., `globalThis.postMessage = () => console.log('INTERCEPTED');`,
   */
  const postMessageInternal = window.postMessage;
  const parentPostMessageInternal = window.parent.postMessage;

  /**
   * Similar to a CSRF token, we use a token to ensure that the postMessage is coming from a trusted source.
   */
  let token =
    window.self === window.top ? getRandomToken() : window.top?.[apiTokenKey];

  if (window.top) {
    // Initialize token at the Builder, reset it on the Canvas after reading
    window.top[apiTokenKey] = window.self === window.top ? token : undefined;
  }

  // Use a fixed token in development to handle HMR updates consistently
  if (process.env.NODE_ENV !== "production") {
    token = "development-token";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emitter = createNanoEvents<Record<any, any>>();

  const wrapAction = (action: unknown) => {
    return { action, token };
  };

  const unwrapAction = (payload: unknown): Action<keyof PublishMap> | null => {
    if (typeof payload !== "object" || payload === null) {
      if (process.env.IS_STROYBOOK) {
        return { type: "storybook", payload: payload } as Action<
          keyof PublishMap
        >;
      }
      // Not a pubsub message (browser extensions, other frames), ignore silently
      return null;
    }

    if (false === "token" in payload) {
      // Not a pubsub message, ignore silently
      return null;
    }

    if (payload.token !== token) {
      console.warn("Pubsub: message with invalid token ignored", payload);
      return null;
    }

    if (false === "action" in payload) {
      console.error("Pubsub: wrapped message missing action field", payload);
      return null;
    }

    // Hide the token from the subsequent subscribers
    payload.token = undefined;
    return payload.action as Action<keyof PublishMap>;
  };

  const handleMessage = (event: MessageEvent) => {
    const action = unwrapAction(event.data);
    if (action === null) return;
    const type = action.type;
    // Execute all updates within a single batch to improve performance
    batchUpdate(() => {
      emitter.emit(type, action.payload);

      // Also emit command-specific events for type-safe subscriptions
      if (
        type === "command" &&
        action.payload &&
        typeof action.payload === "object" &&
        "name" in action.payload
      ) {
        const commandName = (action.payload as { name: string }).name;
        // Pass the full payload to command-specific subscribers
        emitter.emit(
          `command:${commandName}` as keyof PublishMap,
          action.payload
        );
      }
    });
  };

  window.addEventListener("message", handleMessage, false);

  return {
    /**
     * To publish a postMessage event on the current window and parent window from the iframe.
     */
    publish<Type extends keyof PublishMap>(action: Action<Type>) {
      invariant(
        window.self !== window.top,
        "publish is not available in the Builder environment"
      );

      parentPostMessageInternal(wrapAction(action), "*");
      postMessageInternal(wrapAction(action), "*");
    },

    /**
     * To publish a postMessage event on the iframe and parent window from the parent window.
     */
    usePublish() {
      const postMessageRef = useRef<undefined | typeof window.postMessage>(
        undefined
      );

      const iframeRefCallback = useCallback(
        (element: HTMLIFrameElement | null) => {
          if (element == null) {
            postMessageRef.current = undefined;
            return;
          }
          /**
           * To avoid postMessage interception from the canvas, i.e., `globalThis.postMessage = () => console.log('INTERCEPTED');`,
           */
          postMessageRef.current = element.contentWindow!.postMessage;
        },
        []
      );

      const publish = useCallback(
        <Type extends keyof PublishMap>(action: Action<Type>) => {
          invariant(
            window.self === window.top,
            "publish is not available in the Canvas environment"
          );

          if (postMessageRef.current === undefined) {
            return;
          }
          // This ensures the method is called with the correct context.
          const postMessageIframe = postMessageRef.current;

          postMessageIframe(wrapAction(action), "*");
          postMessageInternal(wrapAction(action), "*");
        },
        []
      );
      return [publish, iframeRefCallback] as const;
    },

    /**
     * To subscribe a message event on the current window.
     */
    useSubscribe<Type extends keyof PublishMap>(
      type: Type,
      onAction: (payload: PublishMap[Type]) => void
    ) {
      const handleOnAction = useEffectEvent(onAction);

      useEffect(() => {
        return emitter.on(type, handleOnAction);
      }, [type, handleOnAction]);
    },

    subscribe<Type extends keyof PublishMap>(
      type: Type,
      onAction: (payload: PublishMap[Type]) => void
    ) {
      return emitter.on(type, onAction);
    },
  };
};
