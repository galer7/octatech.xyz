import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
	const posts = (await getCollection("posts"))
		.filter((post) => !post.data.draft)
		.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

	return rss({
		title: "Octatech Engineering Blog",
		description: "Technical insights, tutorials, and lessons learned from the Octatech team.",
		site: context.site!,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.date,
			link: `/blog/posts/${post.slug}/`,
			author: post.data.author,
			categories: post.data.tags,
		})),
		customData: `<language>en-us</language>`,
	});
}
