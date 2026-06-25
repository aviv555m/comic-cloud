interface AniListUser {
  id: number;
  name: string;
  avatar: {
    large: string;
  };
}

interface AniListMedia {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string;
  };
  coverImage: {
    large: string;
  };
  type: string;
}

export const ANILIST_AUTH_URL = "https://anilist.co/api/v2/oauth/authorize?client_id=18151&response_type=token";

export async function fetchAniListUser(token: string): Promise<AniListUser> {
  const query = `
    query {
      Viewer {
        id
        name
        avatar {
          large
        }
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
  return json.data.Viewer;
}

export async function searchAniListManga(token: string, search: string): Promise<AniListMedia[]> {
  const query = `
    query ($search: String) {
      Page (page: 1, perPage: 10) {
        media (search: $search, type: MANGA) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            large
          }
          type
        }
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: { search },
    }),
  });

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
  return json.data.Page.media;
}

export async function updateAniListProgress(token: string, mediaId: number, progress: number): Promise<void> {
  const query = `
    mutation ($mediaId: Int, $progress: Int) {
      SaveMediaListEntry (mediaId: $mediaId, progress: $progress) {
        id
        progress
      }
    }
  `;

  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: { mediaId, progress },
    }),
  });

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
}
