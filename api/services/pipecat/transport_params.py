"""Shared helpers for tuning pipecat ``TransportParams`` per run mode.

These live outside ``transport_setup.py`` (which is non-telephony only) so
that both the WebRTC factory there and the telephony provider factories
under ``api.services.telephony.providers/<name>/transport.py`` can call
into the same place.
"""

# Realtime (speech-to-speech) LLMs don't emit ``TTSStoppedFrame``, so the
# bot-stopped-speaking signal relies on the output-queue-drained fallback.
# The default 3s tail leaves a long gap before the assistant aggregator
# closes its turn; 0.5s keeps the conversation snappy without cutting into
# the bot's own audio (audio chunks arrive far more frequently than this).
REALTIME_BOT_VAD_STOP_SECS = 0.5


def realtime_param_overrides(is_realtime: bool) -> dict:
    """Return kwargs to splat into ``TransportParams`` for the given run mode.

    Currently this only tunes ``bot_vad_stop_secs``; new realtime-specific
    knobs should be added here so each transport stays a thin shim.
    """
    if not is_realtime:
        return {}
    return {"bot_vad_stop_secs": REALTIME_BOT_VAD_STOP_SECS}


def build_aic_input_filter():
    """Build the ai-coustics denoise/enhancement input audio filter, or None.

    Returns ``None`` when ``AIC_DENOISE_ENABLED`` is falsey so denoise can be
    toggled off without a rebuild. Otherwise returns a fresh :class:`AICFilter`
    (one per call/transport; the underlying model is process-cached). Uses the
    same ``AIC_SDK_LICENSE`` as the Quail VAD.

    Env knobs:
      AIC_DENOISE_ENABLED       (default "true")
      AIC_ENHANCEMENT_MODEL_ID  (default "quail-vf-2.1-l-16khz")
      AIC_ENHANCEMENT_LEVEL     (default "0.8")
    """
    import os

    if os.environ.get("AIC_DENOISE_ENABLED", "true").strip().lower() not in (
        "1",
        "true",
        "yes",
        "on",
    ):
        return None

    from pipecat.audio.filters.aic_filter import AICFilter

    license_key = os.environ.get("AIC_SDK_LICENSE", "")
    if not license_key:
        raise RuntimeError(
            "AIC_SDK_LICENSE is not set; ai-coustics denoise requires a license key."
        )
    model_id = os.environ.get("AIC_ENHANCEMENT_MODEL_ID", "quail-vf-2.1-l-16khz")
    enhancement_level = float(os.environ.get("AIC_ENHANCEMENT_LEVEL", "0.8"))
    return AICFilter(
        license_key=license_key,
        model_id=model_id,
        enhancement_level=enhancement_level,
    )
