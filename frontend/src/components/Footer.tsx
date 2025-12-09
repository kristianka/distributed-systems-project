import { ExternalLink } from "lucide-react";

export const Footer = () => {
    return (
        <footer className="mt-16 sm:mt-4 pt-6 border-t border-zinc-800 text-center">
            <p className="text-zinc-500 text-sm">
                <a
                    href="https://kristiankahkonen.com?utm_source=watch-together-footer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-zinc-400 hover:text-white transition-colors mr-4"
                >
                    Kristian Kähkönen
                    <ExternalLink className="ml-1 w-3.5 h-3.5" />
                </a>
                {" · "}
                <a
                    href="https://github.com/kristianka/distributed-systems-project"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-zinc-400 hover:text-white transition-colors ml-4"
                >
                    GitHub Repository
                    <ExternalLink className="ml-1 w-3.5 h-3.5" />
                </a>
            </p>
        </footer>
    );
};
