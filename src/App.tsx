import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  Code,
  Globe,
  Image,
  LucideIcon,
  MessageSquare,
  Video,
} from "lucide-react";

const MeshBackground = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Grid properties
  const cols = 15;
  const rows = 10;
  const points: { x: number; y: number; originX: number; originY: number }[] =
    [];

  // Create grid points
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      points.push({
        x: j,
        y: i,
        originX: j,
        originY: i,
      });
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMousePosition({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 -z-10 bg-black">
      <svg className="h-full w-full">
        <defs>
          <linearGradient
            id="grid-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.1)" />
            <stop offset="50%" stopColor="rgba(99, 102, 241, 0.1)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0.1)" />
          </linearGradient>
        </defs>
        <g>
          {points.map((point, i) => {
            const distX =
              mousePosition.x * window.innerWidth -
              point.x * (window.innerWidth / (cols - 1));
            const distY =
              mousePosition.y * window.innerHeight -
              point.y * (window.innerHeight / (rows - 1));
            const distance = Math.sqrt(distX * distX + distY * distY);
            const maxDistance = Math.sqrt(
              window.innerWidth * window.innerWidth +
                window.innerHeight * window.innerHeight,
            );
            const influence = Math.max(0, 1 - distance / (maxDistance * 0.3));

            const x =
              point.x * (window.innerWidth / (cols - 1)) +
              distX * influence * 0.1;
            const y =
              point.y * (window.innerHeight / (rows - 1)) +
              distY * influence * 0.1;

            return (
              <motion.g key={i}>
                {point.x < cols - 1 && (
                  <motion.line
                    x1={x}
                    y1={y}
                    x2={
                      points[i + 1]?.x * (window.innerWidth / (cols - 1)) +
                      distX * influence * 0.1
                    }
                    y2={
                      points[i + 1]?.y * (window.innerHeight / (rows - 1)) +
                      distY * influence * 0.1
                    }
                    stroke="url(#grid-gradient)"
                    strokeWidth="0.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    transition={{ duration: 1 }}
                  />
                )}
                {point.y < rows - 1 && (
                  <motion.line
                    x1={x}
                    y1={y}
                    x2={
                      points[i + cols]?.x * (window.innerWidth / (cols - 1)) +
                      distX * influence * 0.1
                    }
                    y2={
                      points[i + cols]?.y * (window.innerHeight / (rows - 1)) +
                      distY * influence * 0.1
                    }
                    stroke="url(#grid-gradient)"
                    strokeWidth="0.5"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    transition={{ duration: 1 }}
                  />
                )}
                <motion.circle
                  cx={x}
                  cy={y}
                  r={2}
                  fill="rgba(147, 197, 253, 0.5)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  transition={{ duration: 1 }}
                />
              </motion.g>
            );
          })}
        </g>
      </svg>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/50 to-black/50 backdrop-blur-[2px]" />
    </div>
  );
};

const Service = ({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) => (
  <motion.div
    className="flex flex-col items-center rounded-lg p-6 text-center backdrop-blur-lg"
    style={{
      background:
        "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
      boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
    }}
    whileHover={{
      scale: 1.02,
      transition: { type: "spring", stiffness: 300 },
    }}
  >
    <Icon className="mb-4 h-12 w-12 text-blue-400" />
    <h3 className="mb-2 text-xl font-bold text-white">{title}</h3>
    <p className="text-gray-300">{description}</p>
  </motion.div>
);

const App = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const services = [
    {
      icon: Brain,
      title: "AI Automation Agents",
      description:
        "Custom AI agents that streamline your workflow and automate repetitive tasks",
    },
    {
      icon: Globe,
      title: "Web Automation",
      description:
        "Intelligent web scraping and automation solutions for data collection and processing",
    },
    {
      icon: MessageSquare,
      title: "Content Generation",
      description:
        "AI-powered content creation for marketing, documentation, and communication",
    },
    {
      icon: Code,
      title: "Code Generation",
      description:
        "Automated code generation and optimization tools for faster development",
    },
    {
      icon: Image,
      title: "Image Generation",
      description:
        "Custom AI image generation solutions for creative and commercial applications",
    },
    {
      icon: Video,
      title: "Video Processing",
      description:
        "Automated video generation and processing using cutting-edge AI",
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <MeshBackground />

      <header className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between"
        >
          <h1 className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-3xl font-bold text-transparent">
            Octatech Design
          </h1>
          <nav className="space-x-6">
            <a
              href="#services"
              className="transition-colors hover:text-blue-400"
            >
              Services
            </a>
            <a href="#about" className="transition-colors hover:text-blue-400">
              About
            </a>
            <a
              href="#contact"
              className="transition-colors hover:text-blue-400"
            >
              Contact
            </a>
          </nav>
        </motion.div>
      </header>

      <main className="container mx-auto px-4 py-16">
        <section className="mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mb-16 text-center"
          >
            <h2 className="mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-5xl font-bold text-transparent">
              Automating Tomorrow, Today
            </h2>
            <p className="mx-auto max-w-2xl text-xl text-gray-300">
              We create intelligent AI agents that transform how businesses
              operate, automating complex tasks and unlocking new possibilities.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3"
          >
            {services.map((service, index) => (
              <Service key={index} {...service} />
            ))}
          </motion.div>
        </section>

        <section id="about" className="mb-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
            transition={{ duration: 0.7 }}
            className="rounded-lg p-8 backdrop-blur-lg"
            style={{
              background:
                "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
              boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <h2 className="mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-3xl font-bold text-transparent">
              About Us
            </h2>
            <p className="mb-4 text-gray-300">
              Octatech Design specializes in creating custom AI automation
              solutions that help businesses streamline their operations and
              boost productivity. Our expertise in artificial intelligence and
              automation allows us to deliver cutting-edge solutions tailored to
              your specific needs.
            </p>
            <p className="text-gray-300">
              We believe in the power of AI to transform businesses, and we're
              committed to making this technology accessible and effective for
              our clients.
            </p>
          </motion.div>
        </section>

        <section id="contact" className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
            transition={{ duration: 0.7 }}
            className="rounded-lg p-8 backdrop-blur-lg"
            style={{
              background:
                "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
              boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <h2 className="mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-3xl font-bold text-transparent">
              Contact Us
            </h2>
            <p className="mb-8 text-gray-300">
              Ready to automate your business processes? Get in touch with us to
              discuss how we can help transform your operations with AI.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-3 font-semibold text-white transition-colors hover:from-blue-700 hover:to-purple-700"
            >
              Start a Conversation
            </motion.button>
          </motion.div>
        </section>
      </main>

      <footer className="container mx-auto px-4 py-8 text-center text-gray-400">
        <p>© 2024 Octatech Design SRL. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default App;
