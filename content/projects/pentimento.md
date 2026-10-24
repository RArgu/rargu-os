---
title: Pentimento
short: Pentimento
year: 2026
stack: [Swift 6, AppKit, Metal, TypeScript, Claude Agent SDK]
links: []
status: planning
summary: A native macOS raster editor in the spirit of Paint.NET, built so AI agents can drive it with real tools. It follows PaintDotMac, a Swift/Metal prototype whose compositor matched Paint.NET pixel for pixel.
---

# Pentimento

Status: planning. Nothing is built yet. Until it exists, the Paint app on this machine is the closest thing to it.

## What it is

A native macOS raster editor in the spirit of Paint.NET: simple, fast, and meant for quick edits.

## Why I'm building it

There's nothing like Paint.NET on the Mac, and that's exactly what I want. Sometimes I just need to touch up an image quickly.

I also want an editor my AI agents can drive with native tools. Say ChatGPT generates an image with text in it and I want that text on its own layer. The model can't give me that, but I should be able to open the image in a paint program and tell an agent to pull the text out into a separate layer. That's the workflow Pentimento is designed around.

## What was hard (so far)

Pentimento follows PaintDotMac, a prototype I built in Swift 6, AppKit, and Metal over about six weeks. Its compositor matched Paint.NET 3.36's output pixel for pixel. Its resize engine stayed within a tight error bound on every test case. It had about 1,000 core tests, and a clean-room policy kept it free of Paint.NET's code.

PaintDotMac proved the core could be built. It also showed me I wanted to start again from explicit contracts: a file format, a command-line interface for agents, and performance gates, all defined before the first feature.

## Tooling

`loop` is a ticket-execution tool built on the Claude Agent SDK. It runs bounded units of work in isolated worktrees and has them independently verified and reviewed before anything lands. Pentimento will be built through it.
