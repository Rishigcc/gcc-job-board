import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE } from "../lib/seo";

function Seo({
  title,
  description,
  path = "",
  image = DEFAULT_OG_IMAGE,
  type = "website",
  noindex = false,
  jsonLd,
}) {
  const url = `${SITE_URL}${path}`;
  const jsonLdList = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta
        name="robots"
        content={noindex ? "noindex, nofollow" : "index, follow"}
      />

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {jsonLdList.map((entry, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(entry)}
        </script>
      ))}
    </>
  );
}

export default Seo;
