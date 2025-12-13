import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BriefingService {
  private openai: OpenAI;
  private readonly logger = new Logger(BriefingService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn(
        'OPENAI_API_KEY not set. Briefing generation will be disabled.',
      );
    }
  }

  async generateDailyBriefing(userId: string) {
    if (!this.openai) {
      this.logger.warn('OpenAI not initialized. Skipping briefing generation.');
      return;
    }
    this.logger.log(`Generating daily briefing for user ${userId}`);

    // Mock data fetching (In real app, fetch from Issues/Events)
    const events = [
      "Issue #101 'Login Bug' assigned to you.",
      'PR #45 merged by Sarah.',
      "You were mentioned in 'API Redesign'.",
    ];

    const prompt = `Synthesize these events into a 3-sentence daily briefing for a software engineer:\n${events.join('\n')}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful executive assistant.' },
          { role: 'user', content: prompt },
        ],
      });

      const summary = completion.choices[0].message.content;

      // Generate Audio (TTS)
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: summary || 'No updates today.',
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      const fileName = `briefing-${userId}-${Date.now()}.mp3`;
      const uploadDir = path.join(process.cwd(), 'uploads', 'briefings');

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      fs.writeFileSync(path.join(uploadDir, fileName), buffer);

      this.logger.log(`Briefing generated: ${fileName}`);
      return { summary, audioPath: fileName };
    } catch (error) {
      this.logger.error('Failed to generate briefing', error);
      throw error;
    }
  }
}
