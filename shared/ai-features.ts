// Meta AI / automatic creative features the scanner can flag. A client's
// allowedAiEnhancements holds the keys of the ones that client is fine with;
// every other feature found switched on in an ad gets flagged.
//
// Most keys are Meta's own creative_features_spec names. The last group are
// scanner-made keys for settings found elsewhere in the creative.
export const AI_FEATURES: Array<{ key: string; label: string }> = [
  { key: "advantage_plus_creative", label: "Advantage+ creative (all enhancements)" },
  { key: "standard_enhancements", label: "Standard enhancements" },
  { key: "text_optimizations", label: "Text improvements" },
  { key: "text_generation", label: "AI-generated text" },
  { key: "description_automation", label: "Auto descriptions" },
  { key: "text_translation", label: "Text translation" },
  { key: "image_text_translation", label: "Translate text in images" },
  { key: "translate_voiceover", label: "Translated voice-over" },
  { key: "enhance_cta", label: "Enhanced call to action" },
  { key: "inline_comment", label: "Show comments under ad" },
  { key: "show_summary", label: "Show summary" },
  { key: "show_destination_blurbs", label: "Show website snippets" },
  { key: "reveal_details_over_time", label: "Reveal details over time" },
  { key: "site_extensions", label: "Sitelinks" },
  { key: "image_background_gen", label: "AI-generated backgrounds" },
  { key: "image_uncrop", label: "Expand image" },
  { key: "image_auto_crop", label: "Auto-crop image" },
  { key: "image_touchups", label: "Image touch-ups" },
  { key: "image_brightness_and_contrast", label: "Brightness & contrast" },
  { key: "image_enhancement", label: "Image enhancement" },
  { key: "image_templates", label: "Image templates (frames, overlays)" },
  { key: "image_animation", label: "Animate image" },
  { key: "replace_media_text", label: "Replace text in media" },
  { key: "video_filtering", label: "Video filters" },
  { key: "video_auto_crop", label: "Auto-crop video" },
  { key: "video_uncrop", label: "Expand video" },
  { key: "ig_video_native_subtitle", label: "Instagram video subtitles" },
  { key: "media_liquidity", label: "Flex media" },
  { key: "pac_relaxation", label: "Flex media (placement relaxation)" },
  { key: "media_order", label: "Reorder media" },
  { key: "carousel_to_video", label: "Turn carousel into video" },
  { key: "describe_your_product", label: "Product tags" },
  { key: "product_extensions", label: "Product extensions" },
  { key: "product_browsing", label: "Product browsing" },
  // Not in creative_features_spec; named by the scanner.
  { key: "image_crops", label: "Custom image crops" },
  { key: "multi_share_optimized", label: "Auto-order carousel cards" },
  { key: "dynamic_formats", label: "Dynamic ad formats" },
  { key: "image_expansion", label: "Image expansion / AI backgrounds (Advantage+)" },
  { key: "auto_text", label: "Auto text variations" },
  { key: "auto_music_filters", label: "Auto music & filters" },
  { key: "products_association", label: "Products linked to ad" },
];

const LABELS = new Map(AI_FEATURES.map(f => [f.key, f.label]));

export function aiFeatureLabel(key: string): string {
  return LABELS.get(key) ?? key.replace(/_/g, " ");
}
